// const API_URL = 'http://localhost:3000'; 
const API_URL = 'https://behavior-lab.onrender.com'; // En producción

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const btn = document.getElementById('submitBtn');
  const btnText = document.getElementById('btnText');
  const errorMsg = document.getElementById('errorMsg');

  // UI: Loading state
  btn.disabled = true;
  btnText.textContent = 'Autenticando...';
  errorMsg.classList.add('hidden');

  try {
    const response = await fetch(`${API_URL}/gov/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Credenciales inválidas');
    }

    // Guardar token y datos de usuario
    localStorage.setItem('gov_token', data.token);
    localStorage.setItem('gov_user', JSON.stringify(data.user));

    // Redirigir al dashboard
    window.location.href = 'dashboard.html';

  } catch (error) {
    errorMsg.textContent = error.message;
    errorMsg.classList.remove('hidden');
  } finally {
    // UI: Reset state
    btn.disabled = false;
    btnText.textContent = 'Iniciar Sesión';
  }
});