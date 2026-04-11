import { useState } from 'react'
import './App.css'
import Login from './pages/LoginPage.jsx'
import { BrowserRouter, } from 'react-router-dom'
function App() {

  return (
    <BrowserRouter>
        <div>
      <Login></Login>
    </div>

    </BrowserRouter>
  )
}

export default App
