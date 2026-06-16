// chat-widget.js - Widget flotante para BehaviorLab
(function() {
  // Crear el contenedor del widget en el DOM
  const widgetContainer = document.createElement('div');
  widgetContainer.id = 'chat-widget';
  widgetContainer.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 9999;
    font-family: 'Inter', sans-serif;
  `;
  document.body.appendChild(widgetContainer);

  // Inyectar HTML del widget
  widgetContainer.innerHTML = `
    <button id="chat-toggle" style="
      background: #0055FF;
      color: white;
      border: none;
      border-radius: 50%;
      width: 60px;
      height: 60px;
      font-size: 28px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      transition: all 0.2s;
    ">💬</button>

    <div id="chat-window" style="
      display: none;
      position: absolute;
      bottom: 80px;
      right: 0;
      width: 360px;
      height: 480px;
      background: white;
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
      overflow: hidden;
      flex-direction: column;
      border: 1px solid #e0e0e0;
    ">
      <div style="
        background: #0055FF;
        color: white;
        padding: 16px;
        font-weight: 700;
        font-size: 1.1rem;
        text-align: center;
        flex-shrink: 0;
      ">Asistente BehaviorLab</div>

      <div id="chat-messages" style="
        flex: 1;
        padding: 16px;
        overflow-y: auto;
        background: #f5f7fb;
        display: flex;
        flex-direction: column;
      "></div>

      <div style="
        display: flex;
        border-top: 1px solid #ddd;
        flex-shrink: 0;
      ">
        <input id="chat-input" type="text" placeholder="Escribe tu mensaje..." style="
          flex: 1;
          padding: 12px 16px;
          border: none;
          outline: none;
          font-size: 0.95rem;
        ">
        <button id="chat-send" style="
          background: #0055FF;
          color: white;
          border: none;
          padding: 12px 20px;
          cursor: pointer;
          font-weight: 600;
        ">Enviar</button>
      </div>
    </div>
  `;

  // Referencias a elementos
  const toggleBtn = document.getElementById('chat-toggle');
  const chatWindow = document.getElementById('chat-window');
  const messagesContainer = document.getElementById('chat-messages');
  const inputField = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');

  let isOpen = false;

  // Función para agregar mensajes
  function addMessage(text, sender) {
    const div = document.createElement('div');
    div.style.margin = '6px 0';
    div.style.padding = '10px 14px';
    div.style.borderRadius = '16px';
    div.style.maxWidth = '80%';
    div.style.wordWrap = 'break-word';
    if (sender === 'user') {
      div.style.background = '#0055FF';
      div.style.color = 'white';
      div.style.alignSelf = 'flex-end';
      div.style.marginLeft = 'auto';
    } else {
      div.style.background = '#e9edf4';
      div.style.color = '#1a1a2e';
      div.style.alignSelf = 'flex-start';
    }
    div.textContent = text;
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // Enviar mensaje a la API
  async function sendMessage() {
    const message = inputField.value.trim();
    if (!message) return;
    addMessage(message, 'user');
    inputField.value = '';
    inputField.disabled = true;
    sendBtn.disabled = true;

    try {
      const response = await fetch('https://api.gokulab.mx/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: message,
          // Opcional: puedes enviar mode o multiAgent si lo deseas
          // mode: 'default',
          // multiAgent: false
        })
      });

      const data = await response.json();
      const reply = data.reply || 'Lo siento, no pude procesar tu solicitud.';
      addMessage(reply, 'bot');
    } catch (error) {
      console.error('Error en el chat:', error);
      addMessage('Error de conexión. Intenta más tarde.', 'bot');
    } finally {
      inputField.disabled = false;
      sendBtn.disabled = false;
      inputField.focus();
    }
  }

  // Event listeners
  toggleBtn.addEventListener('click', () => {
    isOpen = !isOpen;
    chatWindow.style.display = isOpen ? 'flex' : 'none';
    if (isOpen && messagesContainer.children.length === 0) {
      addMessage('Hola, soy el asistente de BehaviorLab. ¿En qué puedo ayudarte?', 'bot');
    }
  });

  sendBtn.addEventListener('click', sendMessage);
  inputField.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  // Estilo extra para que el contenedor de mensajes sea flex column
  messagesContainer.style.display = 'flex';
  messagesContainer.style.flexDirection = 'column';
})();