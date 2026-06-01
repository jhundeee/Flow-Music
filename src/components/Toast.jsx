import React, { memo, useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, Info } from 'lucide-react';

let toastId = 0;

const ToastItem = memo(function ToastItem({ id, message, type, onRemove }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setLeaving(true), 3500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => onRemove(id), 300);
    return () => clearTimeout(timer);
  }, [leaving, id, onRemove]);

  return (
    <div className={`toast toast--${type}${leaving ? ' toast--leave' : ''}`}>
      {type === 'success' ? <CheckCircle size={18} /> : type === 'error' ? <AlertCircle size={18} /> : <Info size={18} />}
      <span className="toast-msg">{message}</span>
    </div>
  );
});

export function useToast() {
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'info') => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const ToastContainer = toasts.length > 0 ? (
    <div className="toast-container">
      {toasts.map((t) => (
        <ToastItem key={t.id} {...t} onRemove={removeToast} />
      ))}
    </div>
  ) : null;

  return { addToast, ToastContainer };
}
