import { API_BASE_URL } from '../config';

// Функция для выполнения API запросов
async function apiRequest(url, method = 'GET', data = null, token = null) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options = {
    method,
    headers,
  };

  if (data && method !== 'GET') {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(`${API_BASE_URL}${url}`, options);
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Неизвестная ошибка' }));
    throw new Error(errorData.detail || 'Ошибка запроса');
  }
  
  return response.json();
}

// Сервис аутентификации
export const authService = {
  // Регистрация нового пользователя
  async register(email, name, password) {
    return apiRequest('/auth/register', 'POST', { email, name, password });
  },
  
  // Получение токена доступа
  async login(email, password) {
    return apiRequest('/auth/token', 'POST', { email, password });
  }
};

// Сервис чатов
export const chatService = {
  // Получение списка чатов пользователя
  async getChats(token) {
    return apiRequest('/chats', 'GET', null, token);
  },
  
  // Получение информации о чате по ID
  async getChatById(chatId, token) {
    return apiRequest(`/chats/${chatId}`, 'GET', null, token);
  },
  
  // Создание личного чата
  async createPersonalChat(memberId, token) {
    return apiRequest('/chats/personal', 'POST', {
      type: 'personal',
      member_ids: [memberId]
    }, token);
  },
  
  // Создание группового чата
  async createGroupChat(name, memberIds, token) {
    return apiRequest('/chats/group', 'POST', {
      name,
      type: 'group',
      member_ids: memberIds
    }, token);
  }
};

// Сервис сообщений
export const messageService = {
  // Получение истории чата
  async getChatHistory(chatId, limit = 100, offset = 0, token) {
    return apiRequest(`/chats/${chatId}/history?limit=${limit}&offset=${offset}`, 'GET', null, token);
  },
  
  // Отправка нового сообщения
  async sendMessage(chatId, text, token) {
    return apiRequest('/chats/messages', 'POST', { chat_id: chatId, text }, token);
  },
  
  // Пометить сообщение как прочитанное
  async markMessageAsRead(messageId, token) {
    return apiRequest(`/chats/messages/${messageId}/read`, 'POST', null, token);
  }
}; 