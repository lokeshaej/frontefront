/* global __app_id, __firebase_config, __initial_auth_token */
import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import axios from 'axios';
// Import Lucide React icons for visibility toggle
import { Eye, EyeOff } from 'lucide-react';

// Import the external CSS file
import './App.css';


// Global variables provided by the Canvas environment or fallback for local dev.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
  apiKey: "AIzaSyAIEZQrVi5eMAKSbkFDY73Ux-9-_BwmMqU",
    authDomain: "todos-7c403.firebaseapp.com",
    databaseURL: "https://todos-7c403-default-rtdb.firebaseio.com",
    projectId: "todos-7c403",
    storageBucket: "todos-7c403.firebasestorage.app",
    messagingSenderId: "753824598095",
    appId: "1:753824598095:web:7f985a0eccc09ce807423a"
};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
const BACKEND_API_URL = 'http://localhost:3000'; // Updated to match backend port

function App() {
  // State for Firebase instances, user, todos, and UI interactions
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);

  const [todos, setTodos] = useState([]);

  const [newTodoText, setNewTodoText] = useState('');
  const [newTodoDate, setNewTodoDate] = useState('');
  const [newTodoTime, setNewTodoTime] = useState('');

  const [editingTodoId, setEditingTodoId] = useState(null);
  const [editingTodoText, setEditingTodoText] = useState('');
  const [editingTodoDate, setEditingTodoDate] = useState('');
  const [editingTodoTime, setEditingTodoTime] = useState('');

  const [loading, setLoading] = useState(true);

  const [individualTodoSummaries, setIndividualTodoSummaries] = useState({});
  const [summarizingIndividualTodo, setSummarizingIndividualTodo] = useState({});
  const [sendingIndividualTodoToSlack, setSendingIndividualTodoToSlack] = useState({});
  const [individualTodoSlackMessages, setIndividualTodoSlackMessages] = useState({});
  // New state to control visibility of individual summaries
  const [showIndividualSummary, setShowIndividualSummary] = useState({});
  // NEW: State to control overall todo list visibility
  const [showTodoList, setShowTodoList] = useState(true);


  const [filter, setFilter] = useState('all');

  // Effect for Firebase initialization and authentication
  useEffect(() => {
    try {
      const app = initializeApp(firebaseConfig);
      const firestoreDb = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestoreDb);
      setAuth(firebaseAuth);

      const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          setUserId(user.uid);
          setLoading(false);
        } else {
          try {
            if (initialAuthToken) {
              await signInWithCustomToken(firebaseAuth, initialAuthToken);
            } else {
              await signInAnonymously(firebaseAuth);
            }
          } catch (error) {
            console.error("Error signing in:", error);
            setUserId(crypto.randomUUID());
            setLoading(false);
          }
        }
      });
      return () => unsubscribe();
    } catch (error) {
      console.error("Error initializing Firebase:", error);
      setLoading(false);
    }
  }, []);

  // Effect for real-time todo fetching from Firestore
  useEffect(() => {
    if (!db || !userId) return;
    const todosCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/todos`);
    const q = query(todosCollectionRef);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedTodos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      fetchedTodos.sort((a, b) => (b.createdAt?.toDate() || 0) - (a.createdAt?.toDate() || 0));
      setTodos(fetchedTodos);
    }, (error) => {
      console.error("Error fetching todos:", error);
    });
    return () => unsubscribe();
  }, [db, userId]);

  // CRUD Operations
  const addTodo = async () => {
    if (!newTodoText.trim() || !db || !userId) return;
    try {
      await addDoc(collection(db, `artifacts/${appId}/users/${userId}/todos`), {
        text: newTodoText,
        completed: false,
        createdAt: serverTimestamp(),
        dueDate: newTodoDate || null,
        dueTime: newTodoTime || null
      });
      setNewTodoText('');
      setNewTodoDate('');
      setNewTodoTime('');
      // NEW: Ensure list is visible when a new todo is added
      setShowTodoList(true);
    } catch (e) {
      console.error("Error adding document: ", e);
    }
  };

  const deleteTodo = async (id) => {
    if (!db || !userId) return;
    try {
      await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/todos`, id));
      setIndividualTodoSummaries(prev => {
        const newSummaries = { ...prev };
        delete newSummaries[id];
        return newSummaries;
      });
      setSummarizingIndividualTodo(prev => {
        const newLoading = { ...prev };
        delete newLoading[id];
        return newLoading;
      });
      setIndividualTodoSlackMessages(prev => {
        const newMessages = { ...prev };
        delete newMessages[id];
        return newMessages;
      });
      setSendingIndividualTodoToSlack(prev => {
        const newSending = { ...prev };
        delete newSending[id];
        return newSending;
      });
      // Also remove from showIndividualSummary state
      setShowIndividualSummary(prev => {
        const newShow = { ...prev };
        delete newShow[id];
        return newShow;
      });
    } catch (e) {
      console.error("Error deleting document: ", e);
    }
  };

  const toggleComplete = async (id, completed) => {
    if (!db || !userId) return;
    try {
      await updateDoc(doc(db, `artifacts/${appId}/users/${userId}/todos`, id), { completed: !completed });
    } catch (e) {
      console.error("Error updating document: ", e);
    }
  };

  const startEditing = (todo) => {
    setEditingTodoId(todo.id);
    setEditingTodoText(todo.text);
    setEditingTodoDate(todo.dueDate || '');
    setEditingTodoTime(todo.dueTime || '');
  };

  const cancelEditing = () => {
    setEditingTodoId(null);
    setNewTodoText('');
    setNewTodoDate('');
    setNewTodoTime('');
  };

  const saveEdit = async (id) => {
    if (!editingTodoText.trim() || !db || !userId) return;
    try {
      await updateDoc(doc(db, `artifacts/${appId}/users/${userId}/todos`, id), {
        text: editingTodoText,
        dueDate: editingTodoDate || null,
        dueTime: editingTodoTime || null
      });
      setEditingTodoId(null);
      setEditingTodoText('');
      setEditingTodoDate('');
      setEditingTodoTime('');
      setIndividualTodoSummaries(prev => {
        const newSummaries = { ...prev };
        delete newSummaries[id];
        return newSummaries;
      });
      setIndividualTodoSlackMessages(prev => {
        const newMessages = { ...prev };
        delete newMessages[id];
        return newMessages;
      });
      // Hide summary after editing
      setShowIndividualSummary(prev => ({ ...prev, [id]: false }));
    } catch (e) {
      console.error("Error updating document: ", e);
    }
  };

  // Utility to format date for display
  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(dateString));
    } catch (error) {
      console.error("Error formatting date:", dateString, error);
      return dateString;
    }
  };

  // Function to parse summary text into bullet points for rendering
  const renderSummaryAsBullets = (summaryText) => {
    if (!summaryText) return null;

    // Split the summary by newline characters
    const lines = summaryText.split('\n').filter(line => line.trim() !== '');

    // Check if any line starts with a common bullet point marker
    const hasBulletPoints = lines.some(line => /^\s*[-*•]\s/.test(line));

    if (hasBulletPoints) {
      return (
        <ul>
          {lines.map((line, index) => {
            // Remove common bullet point markers for cleaner display
            const cleanLine = line.replace(/^\s*[-*•]\s*/, '').trim();
            return cleanLine ? <li key={index}>{cleanLine}</li> : null;
          })}
        </ul>
      );
    } else {
      // If no bullet points detected, render as plain text within a paragraph
      return <p>{summaryText}</p>;
    }
  };


  // Backend API Interactions
  const summarizeIndividualTodo = async (todoId, todoText, dueDate, dueTime) => {
    setSummarizingIndividualTodo(prev => ({ ...prev, [todoId]: true }));
    setIndividualTodoSummaries(prev => ({ ...prev, [todoId]: 'Generating summary...' }));
    setIndividualTodoSlackMessages(prev => ({ ...prev, [todoId]: '' }));
    setShowIndividualSummary(prev => ({ ...prev, [todoId]: false })); // Hide previous summary before generating new one
    try {
      const response = await axios.post(`${BACKEND_API_URL}/summarize-single-todo`, { text: todoText, dueDate, dueTime, userId }, { headers: { 'X-User-Id': userId } });
      const data = response.data;
      if (response.status >= 200 && response.status < 300 && data.summary) {
        setIndividualTodoSummaries(prev => ({ ...prev, [todoId]: data.summary }));
        setShowIndividualSummary(prev => ({ ...prev, [todoId]: true })); // Show summary on success
      } else {
        setIndividualTodoSummaries(prev => ({ ...prev, [todoId]: `Error: ${data.error || 'Failed to summarize.'}` }));
        console.error(`Error summarizing todo ${todoId}:`, data.error);
      }
    } catch (error) {
      const errorMessage = error.response?.data || error.message; // Adjusted for Axios error structure
      setIndividualTodoSummaries(prev => ({ ...prev, [todoId]: `Error: ${errorMessage}` }));
      console.error(`Error summarizing todo ${todoId}:`, error);
    } finally {
      setSummarizingIndividualTodo(prev => ({ ...prev, [todoId]: false }));
    }
  };

  const sendIndividualTodoToSlack = async (todoId, todoText, dueDate, dueTime) => {
    setSendingIndividualTodoToSlack(prev => ({ ...prev, [todoId]: true }));
    setIndividualTodoSlackMessages(prev => ({ ...prev, [todoId]: 'Sending to Slack...' }));
    const generatedSummaryForTodo = individualTodoSummaries[todoId];
    try {
      // Corrected: Send the request to your backend's endpoint, not directly to Slack's webhook.
      // Removed the check for SLACK_WEBHOOK_URL as it's a backend concern.
      const slackResponse = await axios.post(`${BACKEND_API_URL}/send-single-todo-to-slack`, {
        text: todoText,
        dueDate: dueDate,
        dueTime: dueTime,
        summary: generatedSummaryForTodo, // Pass the generated summary to the backend
        userId: userId
      }, {
        headers: { 'Content-Type': 'application/json', 'X-User-Id': userId }
      });

      if (slackResponse.status >= 200 && slackResponse.status < 300) {
        setIndividualTodoSlackMessages(prev => ({ ...prev, [todoId]: `Success: ${slackResponse.data.message || 'Message sent to Slack!'}` }));
      } else {
        console.error("Error sending to Slack:", slackResponse.status, slackResponse.data);
        setIndividualTodoSlackMessages(prev => ({ ...prev, [todoId]: `Error: Failed to send to Slack: ${slackResponse.data.error || 'Unknown error'}` }));
      }
    } catch (slackError) {
      console.error("Error in /send-single-todo-to-slack endpoint:", slackError.response?.data || slackError.message);
      setIndividualTodoSlackMessages(prev => ({ ...prev, [todoId]: `Internal server error: ${slackError.response?.data?.error || slackError.message}` }));
    } finally {
      setSendingIndividualTodoToSlack(prev => ({ ...prev, [todoId]: false }));
    }
  };


  // Filter todos based on current filter state
  const filteredTodos = todos.filter(todo => {
    if (filter === 'pending') return !todo.completed;
    if (filter === 'completed') return todo.completed;
    return true;
  });

  // Loading screen
  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-text">Loading application...</div>
      </div>
    );
  }

  // Main UI Render
  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header-container">
        <h1>Todo Summary Assistant</h1>
      </header>

      <div className="content-card">
        {userId && (
          <div className="user-id-display">
            Your User ID: <span className="user-id-value">{userId}</span>
          </div>
        )}

        {/* Add New Todo */}
        <div className="add-todo-section">
          <input
            type="text"
            className="add-todo-input text-input"
            placeholder="Add a new todo..."
            value={newTodoText}
            onChange={(e) => setNewTodoText(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addTodo()}
          />
          <input
            type="date"
            className="add-todo-input date-time-input"
            value={newTodoDate}
            onChange={(e) => setNewTodoDate(e.target.value)}
          />
          <input
            type="time"
            className="add-todo-input date-time-input"
            value={newTodoTime}
            onChange={(e) => setNewTodoTime(e.target.value)}
          />
          <button
            onClick={addTodo}
            className="add-todo-button"
          >
            Add Todos
          </button>
        </div>

        {/* Filter Buttons */}
        <div className="filter-buttons">
          <button
            onClick={() => setFilter('all')}
            className={`filter-button ${filter === 'all' ? 'active' : ''}`}
          >
            View All Todos
          </button>
          <button
            onClick={() => setFilter('pending')}
            className={`filter-button ${filter === 'pending' ? 'active pending-filter' : ''}`}
          >
            Pending Todos
          </button>
          <button
            onClick={() => setFilter('completed')}
            className={`filter-button ${filter === 'completed' ? 'active completed-filter' : ''}`}
          >
            Completed Todos
          </button>
        </div>

        {/* Toggle Todo List Visibility Button with Icons and Conditional Hover Style */}
        <div className="flex justify-center mb-6">
          <button
            onClick={() => setShowTodoList(!showTodoList)}
            className={`filter-button flex flex-col items-center justify-center gap-1 ${showTodoList ? 'toggle-visibility-button show-list' : 'toggle-visibility-button hide-list'}`}
          >
            {showTodoList ? (
              <>
                <EyeOff size={20} /> Hide Todo List
              </>
            ) : (
              <>
                <Eye size={20} /> Show Todo List
              </>
            )}
          </button>
        </div>


        {/* Conditional Rendering of Todo List */}
        {!showTodoList ? (
          <p className="todo-list-empty">Todo list is currently hidden.</p>
        ) : filteredTodos.length === 0 ? (
          <p className="todo-list-empty">
            {todos.length === 0 ? 'No todos yet. Start by adding one!' : `No ${filter} todos.`}
          </p>
        ) : (
          <ul className="todo-list">
            {filteredTodos.map((todo) => (
              <li
                key={todo.id}
                className="todo-item"
              >
                <div className="todo-content-wrapper">
                  {editingTodoId === todo.id ? (
                    <div className="edit-todo-inputs">
                      <input
                        type="text"
                        value={editingTodoText}
                        onChange={(e) => setEditingTodoText(e.target.value)}
                        className="edit-todo-input"
                        onKeyPress={(e) => e.key === 'Enter' && saveEdit(todo.id)}
                      />
                      <input
                        type="date"
                        value={editingTodoDate}
                        onChange={(e) => setNewTodoDate(e.target.value)}
                        className="edit-todo-input"
                      />
                      <input
                        type="time"
                        value={editingTodoTime}
                        onChange={(e) => setNewTodoTime(e.target.value)}
                        className="edit-todo-input"
                      />
                    </div>
                  ) : (
                    <>
                      <input
                        type="checkbox"
                        checked={todo.completed}
                        onChange={() => toggleComplete(todo.id, todo.completed)}
                        className="todo-checkbox"
                      />
                      <span
                        className={`todo-text ${todo.completed ? 'completed' : ''}`}
                      >
                        {todo.text}
                        {todo.dueDate && (
                          <span className="todo-due-date">
                            (Due: {formatDate(todo.dueDate)} {todo.dueTime})
                          </span>
                        )}
                      </span>
                    </>
                  )}

                  <div className="action-buttons">
                    {editingTodoId === todo.id ? (
                      <>
                        <button
                          onClick={() => saveEdit(todo.id)}
                          className="action-button save-button"
                          title="Save"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                        <button
                          onClick={cancelEditing}
                          className="action-button cancel-button"
                          title="Cancel"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </>
                    ) : (
                      <>
                        {/* Summarize Individual Todo Button */}
                        <button
                          onClick={() => summarizeIndividualTodo(todo.id, todo.text, todo.dueDate, todo.dueTime)}
                          disabled={summarizingIndividualTodo[todo.id]}
                          className={`action-button summarize-button ${summarizingIndividualTodo[todo.id] ? 'disabled-button' : ''}`}
                          title="Summarize this todo"
                        >
                          {summarizingIndividualTodo[todo.id] ? (
                            <svg className="spinner h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h10M7 16h10M14 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V10m-9 4l-3-3m0 0l3-3m-3 3h12" />
                            </svg>
                          )}
                        </button>

                        {/* New Send Individual Todo to Slack Button */}
                        <button
                          onClick={() => sendIndividualTodoToSlack(todo.id, todo.text, todo.dueDate, todo.dueTime)}
                          disabled={sendingIndividualTodoToSlack[todo.id]}
                          className={`action-button slack-button ${sendingIndividualTodoToSlack[todo.id] ? 'disabled-button' : ''}`}
                          title="Send this todo to Slack"
                        >
                          {sendingIndividualTodoToSlack[todo.id] ? (
                            <svg className="spinner h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                          )}
                        </button>

                        <button
                          onClick={() => startEditing(todo)}
                          className="action-button edit-button"
                          title="Edit"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => deleteTodo(todo.id)}
                          className="action-button delete-button"
                          title="Delete"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {/* Render summary as bullets with a close button */}
                {individualTodoSummaries[todo.id] && showIndividualSummary[todo.id] && (
                  <div className="individual-summary">
                    <span className="font-semibold">Summary:</span>
                    {renderSummaryAsBullets(individualTodoSummaries[todo.id])}
                    <button
                      onClick={() => setShowIndividualSummary(prev => ({ ...prev, [todo.id]: false }))}
                      className="close-summary-button"
                      title="Close Summary"
                    >
                      &times; {/* HTML entity for multiplication sign, often used as 'x' */}
                    </button>
                  </div>
                )}
                {individualTodoSlackMessages[todo.id] && (
                  <div className={`individual-slack-message ${
                    individualTodoSlackMessages[todo.id].startsWith('Success') ? 'success' : 'error'
                  }`}>
                    {individualTodoSlackMessages[todo.id]}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      <footer className="app-footer-container">
        <p>&copy; {new Date().getFullYear()} Todo Summary Assistant. All rights reserved to Lokesha.</p>
      </footer>
    </div>
  );
}

export default App;
