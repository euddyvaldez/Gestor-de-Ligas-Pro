import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// Removed ./index.css import as per instructions not to create CSS files.
// Global styles and Tailwind are loaded in index.html.

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);