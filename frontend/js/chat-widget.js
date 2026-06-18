// ================================================================
// CHAT WIDGET — BEHAVIORLAB (versión grande y premium)
// ================================================================

(function() {
  'use strict';

  // ---------- CONFIGURACIÓN ----------
  const API_URL = 'https://api.gokulab.mx/chat';
  const PRIMARY = '#2563EB';
  const SECONDARY = '#7C3AED';

  // ---------- CREAR CONTENEDOR ----------
  const container = document.createElement('div');
  container.id = 'behavior-chat-widget';
  container.style.cssText = `
    position: fixed;
    bottom: 28px;
    right: 28px;
    z-index: 9999;
    font-family: 'Inter', -apple-system, sans-serif;
  `;
  document.body.appendChild(container);

  // ---------- HTML ----------
  container.innerHTML = `
    <button id="chat-toggle" style="
      background: linear-gradient(135deg, ${PRIMARY}, ${SECONDARY});
      color: white;
      border: none;
      border-radius: 50%;
      width: 68px;
      height: 68px;
      font-size: 30px;
      cursor: pointer;
      box-shadow: 0 8px 40px rgba(37,99,235,0.35);
      transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    ">
      <span style="position: relative; z-index: 2;">💬</span>
      <span style="
        position: absolute;
        inset: -4px;
        border-radius: 50%;
        border: 2px solid ${PRIMARY};
        animation: pulse-ring 2s ease-out infinite;
        opacity: 0;
      "></span>
    </button>

    <div id="chat-window" style="
      display: none;
      position: absolute;
      bottom: 84px;
      right: 0;
      width: 420px;
      max-height: 620px;
      background: #0A1128;
      border-radius: 24px;
      box-shadow: 0 24px 80px rgba(0,0,0,0.7);
      overflow: hidden;
      flex-direction: column;
      border: 1px solid rgba(255,255,255,0.06);
      opacity: 0;
      transform: scale(0.92) translateY(20px);
      transition: opacity 0.35s ease, transform 0.35s cubic-bezier(0.25, 0.8, 0.25, 1);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
    ">
      <div style="
        background: linear-gradient(135deg, #0A1128, #1A2333);
        padding: 20px 24px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        display: flex;
        align-items: center;
        gap: 14px;
        flex-shrink: 0;
      ">
        <div style="
          width: 44px;
          height: 44px;
          background: linear-gradient(135deg, ${PRIMARY}, ${SECONDARY});
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          box-shadow: 0 0 24px rgba(37,99,235,0.2);
          flex-shrink: 0;
        ">🧠</div>
        <div style="flex:1;">
          <div style="color: white; font-weight: 700; font-size: 1.1rem;">BehaviorLab</div>
          <div style="color: ${PRIMARY}; font-size: 0.75rem; display: flex; align-items: center; gap: 6px;">
            <span style="display:inline-block;width:6px;height:6px;background:#22c55e;border-radius:50%;"></span>
            Asistente en línea
          </div>
        </div>
        <button id="chat-close" style="
          background: rgba(255,255,255,0.04);
          border: none;
          color: rgba(255,255,255,0.3);
          width: 36px;
          height: 36px;
          border-radius: 50%;
          font-size: 18px;
          cursor: pointer;
          transition: all 0.2s;
        ">✕</button>
      </div>

      <div id="chat-messages" style="
        flex: 1;
        padding: 20px 20px 12px;
        overflow-y: auto;
        min-height: 240px;
        max-height: 380px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      "></div>

      <div id="typing-indicator" style="
        display: none;
        padding: 6px 20px 14px;
        color: rgba(255,255,255,0.35);
        font-size: 0.8rem;
        align-items: center;
        gap: 10px;
      ">
        <div style="display:flex;gap:4px;">
          <span style="display:inline-block;width:6px;height:6px;background:${PRIMARY};border-radius:50%;animation:blink 1.4s infinite;"></span>
          <span style="display:inline-block;width:6px;height:6px;background:${PRIMARY};border-radius:50%;animation:blink 1.4s infinite 0.2s;"></span>
          <span style="display:inline-block;width:6px;height:6px;background:${PRIMARY};border-radius:50%;animation:blink 1.4s infinite 0.4s;"></span>
        </div>
        <span>Escribiendo...</span>
      </div>

      <div style="
        display: flex;
        border-top: 1px solid rgba(255,255,255,0.04);
        padding: 10px 16px 14px;
        gap: 10px;
        background: rgba(255,255,255,0.02);
        flex-shrink: 0;
      ">
        <input id="chat-input" type="text" placeholder="Escribe tu mensaje..." style="
          flex: 1;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 30px;
          padding: 12px 20px;
          color: white;
          font-size: 0.95rem;
          outline: none;
          transition: all 0.25s;
          font-family: inherit;
        ">
        <button id="chat-send" style="
          background: linear-gradient(135deg, ${PRIMARY}, ${SECONDARY});
          color: white;
          border: none;
          border-radius: 50%;
          width: 50px;
          height: 50px;
          cursor: pointer;
          font-size: 18px;
          transition: all 0.2s;
          box-shadow: 0 4px 20px rgba(37,99,235,0.2);
          flex-shrink: 0;
        ">➤</button>
      </div>
    </div>
  `;

  // ---------- ESTILOS GLOBALES ----------
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse-ring {
      0% { transform: scale(1); opacity: 0.8; }
      100% { transform: scale(1.2); opacity: 0; }
    }
    @keyframes blink {
      0%,100%{opacity:0.2;}50%{opacity:1;}
    }
    @keyframes messageIn {
      0%{opacity:0;transform:translateY(8px) scale(0.96);}
      100%{opacity:1;transform:translateY(0) scale(1);}
    }
    #chat-window.open {
      display: flex !important;
      opacity: 1 !important;
      transform: scale(1) translateY(0) !important;
    }
    .chat-message {
      padding: 12px 18px;
      border-radius: 16px;
      max-width: 82%;
      word-wrap: break-word;
      line-height: 1.5;
      font-size: 0.95rem;
      animation: messageIn 0.3s ease;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .chat-message.bot {
      align-self: flex-start;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.04);
      color: #E2E8F0;
      border-bottom-left-radius: 4px;
    }
    .chat-message.user {
      align-self: flex-end;
      background: linear-gradient(135deg, ${PRIMARY}, ${SECONDARY});
      color: white;
      border-bottom-right-radius: 4px;
      box-shadow: 0 4px 16px rgba(37,99,235,0.15);
    }
    #chat-input:focus {
      border-color: ${PRIMARY};
      box-shadow: 0 0 0 3px rgba(37,99,235,0.12);
    }
    #chat-send:hover { transform: scale(1.05); box-shadow: 0 6px 28px rgba(37,99,235,0.35); }
    #chat-send:active { transform: scale(0.95); }
    #chat-toggle:hover { transform: scale(1.05); }
    #chat-close:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.6); }
    #chat-messages::-webkit-scrollbar { width: 4px; }
    #chat-messages::-webkit-scrollbar-track { background: transparent; }
    #chat-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 10px; }
  `;
  document.head.appendChild(style);

  // ---------- REFERENCIAS ----------
  const toggleBtn = document.getElementById('chat-toggle');
  const closeBtn = document.getElementById('chat-close');
  const chatWindow = document.getElementById('chat-window');
  const messagesContainer = document.getElementById('chat-messages');
  const inputField = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  const typingIndicator = document.getElementById('typing-indicator');

  let isOpen = false;

  function openChat() {
    isOpen = true;
    chatWindow.classList.add('open');
    if (messagesContainer.children.length === 0) {
      addMessage('Hola, soy el asistente de BehaviorLab. ¿En qué puedo ayudarte hoy?', 'bot');
    }
    setTimeout(() => inputField.focus(), 400);
  }

  function closeChat() {
    isOpen = false;
    chatWindow.classList.remove('open');
  }

  function addMessage(text, sender) {
    const div = document.createElement('div');
    div.className = `chat-message ${sender}`;
    div.textContent = text;
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function showTyping() {
    typingIndicator.style.display = 'flex';
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
  function hideTyping() {
    typingIndicator.style.display = 'none';
  }

  async function sendMessage() {
    const message = inputField.value.trim();
    if (!message) return;
    addMessage(message, 'user');
    inputField.value = '';
    inputField.disabled = true;
    sendBtn.disabled = true;
    showTyping();
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      const data = await response.json();
      const reply = data.reply || 'Lo siento, no pude procesar tu solicitud.';
      hideTyping();
      addMessage(reply, 'bot');
    } catch (error) {
      console.error(error);
      hideTyping();
      addMessage('Error de conexión. Intenta más tarde.', 'bot');
    } finally {
      inputField.disabled = false;
      sendBtn.disabled = false;
      inputField.focus();
    }
  }

  toggleBtn.addEventListener('click', () => isOpen ? closeChat() : openChat());
  closeBtn.addEventListener('click', closeChat);
  sendBtn.addEventListener('click', sendMessage);
  inputField.addEventListener('keypress', (e) => e.key === 'Enter' && sendMessage());
  document.addEventListener('keydown', (e) => e.key === 'Escape' && isOpen && closeChat());
})();