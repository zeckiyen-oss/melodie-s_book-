/**
 * Theme Manager for Mélodie's Book
 * Gère le basculement entre les thèmes clair et sombre
 * Utilise localStorage pour la persistance
 */

// Variables de thème
const THEME_KEY = 'melodie-theme';
const DARK_THEME = 'dark';
const LIGHT_THEME = 'light';

// Applique le thème au chargement de la page
function initTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY) || DARK_THEME;
  applyTheme(savedTheme);
  updateThemeToggleButton();
}

// Applique un thème spécifique
function applyTheme(theme) {
  const body = document.body;
  
  // Retire toutes les classes de thème
  body.classList.remove('dark-mode', 'light-mode');
  
  // Applique la classe correspondante
  if (theme === LIGHT_THEME) {
    body.classList.add('light-mode');
  } else {
    body.classList.add('dark-mode');
  }
  
  // Sauvegarde dans localStorage
  localStorage.setItem(THEME_KEY, theme);
  
  // Met à jour l'icône du toggle
  updateThemeToggleButton();
}

// Bascule entre les thèmes
function toggleTheme() {
  const currentTheme = localStorage.getItem(THEME_KEY) || DARK_THEME;
  const newTheme = currentTheme === DARK_THEME ? LIGHT_THEME : DARK_THEME;
  applyTheme(newTheme);
}

// Met à jour l'icône du bouton toggle
function updateThemeToggleButton() {
  const currentTheme = localStorage.getItem(THEME_KEY) || DARK_THEME;
  const toggleIcon = document.getElementById('theme-toggle-icon');
  const toggleButton = document.querySelector('.theme-toggle');
  
  if (toggleIcon) {
    toggleIcon.textContent = currentTheme === LIGHT_THEME ? '🌙' : '☀️';
  }
  
  if (toggleButton) {
    if (currentTheme === LIGHT_THEME) {
      toggleButton.classList.add('light-mode');
      toggleButton.classList.remove('dark-mode');
    } else {
      toggleButton.classList.add('dark-mode');
      toggleButton.classList.remove('light-mode');
    }
  }
}

// Crée le bouton toggle thème pour la navbar
function createThemeToggleButton() {
  return `
    <button 
      class="theme-toggle-btn" 
      onclick="toggleTheme()" 
      aria-label="Basculer entre les thèmes clair et sombre"
      title="Changer de thème"
    >
      <span id="theme-toggle-icon">☀️</span>
    </button>
  `;
}

// Initialise automatiquement au chargement
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initTheme);
  window.initTheme = initTheme;
  window.toggleTheme = toggleTheme;
  window.applyTheme = applyTheme;
}
