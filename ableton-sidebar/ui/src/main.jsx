import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './theme.css'

// Safety net: a component error must degrade, not black out the device view.
class Boundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, fontSize: 13, color: '#ff6b6b' }}>
          Backline hit an error: {String(this.state.error?.message || this.state.error)}
          <button
            style={{ marginLeft: 10, padding: '2px 10px' }}
            onClick={() => location.reload()}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <Boundary>
    <App />
  </Boundary>,
)
