// ================================================================
// CHAT WIDGET — BEHAVIORLAB (versión premium)
// ================================================================

(function() {
  'use strict';

  const API_URL = 'https://api.gokulab.mx/chat';
  const PRIMARY = '#2563EB';
  const SECONDARY = '#7C3AED';
  const GLOW_COLOR = 'rgba(37, 99, 235, 0.5)';

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

  container.innerHTML = `
    <button id="chat-toggle" style="
      background: ${PRIMARY};
      color: #0A1128;
      border: none;
      border-radius: 50%;
      width: 72px;
      height: 72px;
      font-size: 32px;
      cursor: pointer;
      box-shadow: 0 0 40px ${GLOW_COLOR};
      transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    ">
      <span style="position: relative; z-index: 2;">💬</span>
      <span style="
        position: absolute;
        inset: -6px;
        border-radius: 50%;
        border: 2px solid ${PRIMARY};
        animation: pulse-ring 2s ease-out infinite;
        opacity: 0;
      "></span>
    </button>

    <div id="chat-window" style="
      display: none;
      position: absolute;
      bottom: 88px;
      right: 0;
      width: 460px;
      max-height: 680px;
      background: #0A1128;
      border-radius: 28px;
      box-shadow: 0 30px 100px rgba(0, 0, 0, 0.8), 0 0 60px ${GLOW_COLOR};
      overflow: hidden;
      flex-direction: column;
      border: 1px solid ${PRIMARY}44;
      opacity: 0;
      transform: scale(0.92) translateY(20px);
      transition: opacity 0.4s ease, transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
    ">
      <div style="
        background: linear-gradient(135deg, #0A1128, #1A2333);
        padding: 22px 28px;
        border-bottom: 1px solid ${PRIMARY}44;
        display: flex;
        align-items: center;
        gap: 16px;
        flex-shrink: 0;
        position: relative;
        overflow: hidden;
      ">
        <div style="
          position: absolute;
          top: -60%;
          right: -10%;
          width: 250px;
          height: 250px;
          background: radial-gradient(circle, ${PRIMARY}22, transparent 70%);
          pointer-events: none;
        "></div>
        <div style="
          width: 52px;
          height: 52px;
          background: ${PRIMARY};
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 26px;
          box-shadow: 0 0 30px ${GLOW_COLOR};
          flex-shrink: 0;
        ">🧠</div>
        <div style="flex: 1;">
          <div style="color: white; font-weight: 700; font-size: 1.2rem; letter-spacing: -0.3px;">BehaviorLab</div>
          <div style="color: ${PRIMARY}; font-size: 0.8rem; display: flex; align-items: center; gap: 6px;">
            <span style="display:inline-block;width:8px;height:8px;background:#22c55e;border-radius:50%;box-shadow:0 0 10px #22c55e;"></span>
            En línea · IA empresarial
          </div>
        </div>
        <button id="chat-close" style="
          background: rgba(255,255,255,0.04);
          border: none;
          color: rgba(255,255,255,0.4);
          width: 40px;
          height: 40px;
          border-radius: 50%;
          font-size: 20px;
          cursor: pointer;
          transition: all 0.2s;
        ">✕</button>
      </div>

      <div id="chat-messages" style="
        flex: 1;
        padding: 24px 24px 16px;
        overflow-y: auto;
        min-height: 280px;
        max-height: 420px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        background: rgba(0,0,0,0.2);
      "></div>

      <div id="typing-indicator" style="
        display: none;
        padding: 8px 24px 16px;
        color: rgba(255,255,255,0.4);
        font-size: 0.85rem;
        align-items: center;
        gap: 12px;
      ">
        <div style="display:flex;gap:6px;">
          <span style="display:inline-block;width:8px;height:8px;background:${PRIMARY};border-radius:50%;animation:blink 1.4s infinite;"></span>
          <span style="display:inline-block;width:8px;height:8px;background:${PRIMARY};border-radius:50%;animation:blink 1.4s infinite 0.2s;"></span>
          <span style="display:inline-block;width:8px;height:8px;background:${PRIMARY};border-radius:50%;animation:blink 1.4s infinite 0.4s;"></span>
        </div>
        <span style="color: rgba(255,255,255,0.3);">Escribiendo respuesta...</span>
      </div>

      <div style="
        display: flex;
        border-top: 1px solid ${PRIMARY}44;
        padding: 12px 20px 18px;
        gap: 12px;
        background: rgba(0,0,0,0.3);
        flex-shrink: 0;
      ">
        <input id="chat-input" type="text" placeholder="Escribe tu mensaje..." style="
          flex: 1;
          background: rgba(255,255,255,0.04);
          border: 1px solid ${PRIMARY}44;
          border-radius: 40px;
          padding: 14px 22px;
          color: white;
          font-size: 1rem;
          outline: none;
          transition: all 0.25s;
          font-family: inherit;
        ">
        <button id="chat-send" style="
          background: ${PRIMARY};
          color: #0A1128;
          border: none;
          border-radius: 50%;
          width: 56px;
          height: 56px;
          cursor: pointer;
          font-size: 22px;
          font-weight: 700;
          transition: all 0.2s;
          box-shadow: 0 4px 30px ${GLOW_COLOR};
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        ">➤</button>
      </div>
    </div>
  `;

  // Inyectar estilos globales
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse-ring {
      0% { transform: scale(1); opacity: 0.8; }
      100% { transform: scale(1.3); opacity: 0; }
    }
    @keyframes blink {
      0%,100%{opacity:0.2;}50%{opacity:1;}
    }
    @keyframes messageIn {
      0%{opacity:0;transform:translateY(12px) scale(0.95);}
      100%{opacity:1;transform:translateY(0) scale(1);}
    }
    #chat-window.open {
      display: flex !important;
      opacity: 1 !important;
      transform: scale(1) translateY(0) !important;
    }
    .chat-message {
      padding: 14px 20px;
      border-radius: 20px;
      max-width: 85%;
      word-wrap: break-word;
      line-height: 1.6;
      font-size: 1rem;
      animation: messageIn 0.3s ease;
      box-shadow: 0 4px 16px rgba(0,0,0,0.15);
    }
    .chat-message.bot {
      align-self: flex-start;
      background: rgba(255,255,255,0.06);
      border: 1px solid ${PRIMARY}44;
      color: #E2E8F0;
      border-bottom-left-radius: 6px;
    }
    .chat-message.user {
      align-self: flex-end;
      background: linear-gradient(135deg, ${PRIMARY}, ${SECONDARY});
      color: white;
      border-bottom-right-radius: 6px;
      box-shadow: 0 4px 24px ${GLOW_COLOR};
    }
    #chat-input:focus {
      border-color: ${PRIMARY};
      box-shadow: 0 0 0 4px ${PRIMARY}22, 0 0 30px ${PRIMARY}22;
    }
    #chat-send:hover { transform: scale(1.08); box-shadow: 0 6px 40px ${GLOW_COLOR}; }
    #chat-send:active { transform: scale(0.92); }
    #chat-toggle:hover { transform: scale(1.05); }
    #chat-close:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); }
    #chat-messages::-webkit-scrollbar { width: 5px; }
    #chat-messages::-webkit-scrollbar-track { background: transparent; }
    #chat-messages::-webkit-scrollbar-thumb { background: ${PRIMARY}44; border-radius: 10px; }
  `;
  document.head.appendChild(style);

  // Referencias y lógica del chat
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
      addMessage('👋 Hola, soy el asistente de BehaviorLab. ¿En qué puedo ayudarte hoy?', 'bot');
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
      addMessage('❌ Error de conexión. Intenta más tarde.', 'bot');
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