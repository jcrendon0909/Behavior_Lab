// ================================================================
// CHAT WIDGET — BEHAVIORLAB (versión premium)
// ================================================================

(function() {
  'use strict';

  // ---------- CONFIGURACIÓN ----------
  const API_URL = 'https://api.gokulab.mx/chat';
  const WIDGET_COLOR = '#00D4AA';        // Acento principal (verde neón)
  const BOT_AVATAR = '🤖';               // Puedes reemplazar con URL de logo
  const USER_AVATAR = '👤';

  // ---------- CREAR EL CONTENEDOR ----------
  const container = document.createElement('div');
  container.id = 'behavior-chat-widget';
  container.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 9999;
    font-family: 'Inter', 'Segoe UI', sans-serif;
  `;
  document.body.appendChild(container);

  // ---------- INYECTAR HTML ----------
  container.innerHTML = `
    <!-- Botón flotante -->
    <button id="chat-toggle" style="
      background: ${WIDGET_COLOR};
      color: #0A0A1A;
      border: none;
      border-radius: 50%;
      width: 64px;
      height: 64px;
      font-size: 28px;
      cursor: pointer;
      box-shadow: 0 8px 24px rgba(0, 212, 170, 0.4);
      transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
      display: flex;
      align-items: center;
      justify-content: center;
      transform: scale(1);
    ">💬</button>

    <!-- Ventana del chat -->
    <div id="chat-window" style="
      display: none;
      position: absolute;
      bottom: 80px;
      right: 0;
      width: 380px;
      height: 520px;
      background: #111128;
      border-radius: 24px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
      overflow: hidden;
      flex-direction: column;
      border: 1px solid rgba(255,255,255,0.08);
      opacity: 0;
      transform: scale(0.95) translateY(20px);
      transition: opacity 0.3s ease, transform 0.3s ease;
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
    ">
      <!-- Header -->
      <div style="
        background: linear-gradient(135deg, #0A0A1A, #1A1A3E);
        padding: 18px 20px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        display: flex;
        align-items: center;
        gap: 12px;
        flex-shrink: 0;
      ">
        <div style="
          width: 40px;
          height: 40px;
          background: ${WIDGET_COLOR};
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
        ">${BOT_AVATAR}</div>
        <div>
          <div style="color: white; font-weight: 700; font-size: 1rem;">BehaviorLab</div>
          <div style="color: #00D4AA; font-size: 0.75rem; opacity: 0.8;">● En línea</div>
        </div>
        <button id="chat-close" style="
          margin-left: auto;
          background: none;
          border: none;
          color: rgba(255,255,255,0.4);
          font-size: 20px;
          cursor: pointer;
          transition: color 0.2s;
        ">✕</button>
      </div>

      <!-- Mensajes -->
      <div id="chat-messages" style="
        flex: 1;
        padding: 16px;
        overflow-y: auto;
        background: transparent;
        display: flex;
        flex-direction: column;
        gap: 8px;
      "></div>

      <!-- Indicador de escritura (oculto) -->
      <div id="typing-indicator" style="
        display: none;
        padding: 8px 16px;
        color: rgba(255,255,255,0.5);
        font-size: 0.85rem;
        align-items: center;
        gap: 8px;
      ">
        <span style="display: inline-block; animation: blink 1.2s infinite;">●</span>
        <span style="display: inline-block; animation: blink 1.2s infinite 0.2s;">●</span>
        <span style="display: inline-block; animation: blink 1.2s infinite 0.4s;">●</span>
        <span style="margin-left: 8px;">Escribiendo...</span>
      </div>

      <!-- Input -->
      <div style="
        display: flex;
        border-top: 1px solid rgba(255,255,255,0.06);
        padding: 8px 12px;
        gap: 8px;
        background: rgba(255,255,255,0.02);
        flex-shrink: 0;
      ">
        <input id="chat-input" type="text" placeholder="Escribe tu mensaje..." style="
          flex: 1;
          background: rgba(255,255,255,0.06);
          border: none;
          border-radius: 30px;
          padding: 12px 18px;
          color: white;
          font-size: 0.95rem;
          outline: none;
          transition: background 0.2s;
        ">
        <button id="chat-send" style="
          background: ${WIDGET_COLOR};
          color: #0A0A1A;
          border: none;
          border-radius: 50%;
          width: 48px;
          height: 48px;
          cursor: pointer;
          font-size: 18px;
          font-weight: 700;
          transition: transform 0.2s, box-shadow 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        ">➤</button>
      </div>
    </div>
  `;

  // ---------- ESTILOS GLOBALES (keyframes) ----------
  const style = document.createElement('style');
  style.textContent = `
    @keyframes blink {
      0%, 100% { opacity: 0.3; }
      50% { opacity: 1; }
    }
    #chat-window.open {
      display: flex !important;
      opacity: 1 !important;
      transform: scale(1) translateY(0) !important;
    }
    .chat-message {
      padding: 10px 14px;
      border-radius: 16px;
      max-width: 80%;
      word-wrap: break-word;
      line-height: 1.5;
      font-size: 0.95rem;
      animation: messageIn 0.3s ease;
    }
    @keyframes messageIn {
      0% { opacity: 0; transform: translateY(10px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    .chat-message.bot {
      align-self: flex-start;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.06);
      color: white;
    }
    .chat-message.user {
      align-self: flex-end;
      background: ${WIDGET_COLOR};
      color: #0A0A1A;
      border: 1px solid ${WIDGET_COLOR};
    }
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

  // ---------- FUNCIONES ----------
  function openChat() {
    isOpen = true;
    chatWindow.classList.add('open');
    if (messagesContainer.children.length === 0) {
      addMessage('Hola, soy el asistente de BehaviorLab. ¿En qué puedo ayudarte hoy?', 'bot');
    }
    inputField.focus();
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
        body: JSON.stringify({ message: message })
      });
      const data = await response.json();
      const reply = data.reply || 'Lo siento, no pude procesar tu solicitud.';
      hideTyping();
      addMessage(reply, 'bot');
    } catch (error) {
      console.error('Error en el chat:', error);
      hideTyping();
      addMessage('Error de conexión. Intenta más tarde.', 'bot');
    } finally {
      inputField.disabled = false;
      sendBtn.disabled = false;
      inputField.focus();
    }
  }

  // ---------- EVENTOS ----------
  toggleBtn.addEventListener('click', () => {
    if (isOpen) {
      closeChat();
    } else {
      openChat();
    }
  });

  closeBtn.addEventListener('click', closeChat);
  sendBtn.addEventListener('click', sendMessage);
  inputField.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  // ---------- INICIO ----------
  // El widget se carga y espera la interacción del usuario.
  // (No se abre automáticamente para no molestar.)

})();