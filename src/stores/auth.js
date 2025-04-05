import { defineStore } from 'pinia';
import { authService } from '../services/api';
import { STORAGE_KEYS } from '../config';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem(STORAGE_KEYS.TOKEN) || null,
    userId: localStorage.getItem(STORAGE_KEYS.USER_ID) || null,
    userData: JSON.parse(localStorage.getItem(STORAGE_KEYS.USER_DATA) || 'null'),
    loading: false,
    error: null
  }),

  getters: {
    isAuthenticated: (state) => !!state.token,
    getToken: (state) => state.token,
    getUserId: (state) => state.userId,
    getUserEmail: (state) => state.user?.email,
    getUserName: (state) => state.user?.name,
    getUser: (state) => state.user
  },

  actions: {
    // Регистрация нового пользователя
    async register(email, name, password) {
      this.loading = true;
      this.error = null;
      
      try {
        const userData = await authService.register(email, name, password);
        return userData;
      } catch (error) {
        this.error = error.message;
        throw error;
      } finally {
        this.loading = false;
      }
    },

    // Авторизация пользователя
    async login(email, password) {
      this.loading = true;
      this.error = null;
      
      try {
        const response = await authService.login(email, password);
        
        this.token = response.access_token;
        this.userId = response.user_id;
        
        localStorage.setItem(STORAGE_KEYS.TOKEN, this.token);
        localStorage.setItem(STORAGE_KEYS.USER_ID, this.userId);
        
        return response;
      } catch (error) {
        this.error = error.message;
        throw error;
      } finally {
        this.loading = false;
      }
    },

    // Выход из аккаунта
    logout() {
      this.token = null;
      this.userId = null;
      this.userData = null;
      
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER_ID);
      localStorage.removeItem(STORAGE_KEYS.USER_DATA);
    },

    // Установка данных пользователя
    setUserData(userData) {
      this.userData = userData;
      localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));
    }
  }
}); 