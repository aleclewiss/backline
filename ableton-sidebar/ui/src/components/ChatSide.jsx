import React, { useState, useRef, useEffect } from 'react'
import { useStore } from '../store.js'
import { TYPE_LABEL } from '../utils.js'

function ProposalCard({ proposal }) {
  const applyProposal = useStore((s) => s.applyProposal)
  return (
    <div className="use-this">
      <div><b>{proposal.prompt}</b></div>
      <div style={{ color: 'var(--muted)', marginTop: 2 }}>
        {[
          proposal.type && TYPE_LABEL[proposal.type],
          proposal.lengthBars && `${proposal.lengthBars} bars`,
          proposal.guided?.genre,
          ...(proposal.guided?.moods || []),
        ].filter(Boolean).join(' · ')}
      </div>
      <button className="use-btn" onClick={() => applyProposal(proposal)}>Use this</button>
    </div>
  )
}

export default function ChatSide() {
  const chatOpen = useStore((s) => s.chatOpen)
  const toggleChat = useStore((s) => s.toggleChat)
  const chatAvailable = useStore((s) => s.chatAvailable)
  const chatMessages = useStore((s) => s.chatMessages)
  const chatBusy = useStore((s) => s.chatBusy)
  const sendChat = useStore((s) => s.sendChat)
  const openSettings = useStore((s) => s.openSettings)
  const [text, setText] = useState('')
  const msgsRef = useRef(null)

  useEffect(() => {
    msgsRef.current?.scrollTo(0, msgsRef.current.scrollHeight)
  }, [chatMessages, chatBusy])

  const submit = () => {
    const t = text.trim()
    if (!t || chatBusy) return
    setText('')
    sendChat(t)
  }

  if (!chatOpen) {
    return (
      <div className="side collapsed">
        <button className="side-reopen" title="Open assistant" onClick={toggleChat}>
          <span className="vlabel">Assistant</span>
          <span className="chev">‹</span>
        </button>
      </div>
    )
  }

  return (
    <div className="side">
      <div className="side-head">
        <span>Assistant</span>
        <span className="spacer" />
        {chatMessages.length > 0 && (
          <button className="icon-btn" title="Clear conversation" onClick={() => useStore.getState().clearChat()}>Clear</button>
        )}
        <button className="icon-btn" title="Collapse" onClick={toggleChat}>›</button>
      </div>

      {!chatAvailable ? (
        <div className="chat-empty">
          Add an AI provider API key to chat with the assistant.{' '}
          <button onClick={() => openSettings(true)}>Open Settings</button>
        </div>
      ) : (
        <>
          <div className="chat-msgs" ref={msgsRef}>
            {chatMessages.length === 0 && (
              <div className="chat-empty">
                Describe a vibe or ask for ideas — I’ll turn it into tags and settings you can load into the composer.
              </div>
            )}
            {chatMessages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`}>
                {m.content}
                {m.proposal && <ProposalCard proposal={m.proposal} />}
              </div>
            ))}
            {chatBusy && <div className="chat-msg assistant">…</div>}
          </div>
          <div className="chat-input-row">
            <input
              placeholder="e.g. moody lo-fi keys, 80 bpm"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
            <button onClick={submit} disabled={chatBusy}>Send</button>
          </div>
        </>
      )}
    </div>
  )
}
