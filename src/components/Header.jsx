import React from 'react'

export default function Header({ title, note }) {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const currentMonth = months[new Date().getMonth()];
  
  return (
    <div>
      <h1>{title}</h1>
      <div className="subtitle">Exhibition — {currentMonth}</div>
      <div className="note">{note}</div>
    </div>
  )
}
