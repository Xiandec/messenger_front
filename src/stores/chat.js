import { defineStore } from 'pinia';
import { chatService, messageService } from '../services/api';
import { useAuthStore } from './auth';
import { v4 as uuidv4 } from 'uuid';
import { webSocketService } from '../services/websocket';

// Для работы с уведомлениями
import { useToast } from 'vue-toastification';

export const useChatStore = defineStore('chat', {
  state: () => ({
    chats: [],
    currentChat: null,
    messages: {},
    loading: false,
    error: null,
    // Состояние соединения глобального WebSocket
    globalWebSocketStatus: 'disconnected',
    // Кэш для предотвращения дублирования уведомлений
    notificationCache: new Set(),
    // Флаг, указывающий, что глобальный вебсокет уже инициализирован
    globalWebSocketInitialized: false
  }),

  getters: {
    getChatList: (state) => state.chats,
    getCurrentChat: (state) => state.currentChat,
    getMessages: (state) => (chatId) => state.messages[chatId] || [],
    getCurrentMessages: (state) => state.messages[state.currentChat?.id] || []
  },

  actions: {
    // Загрузка списка чатов
    async fetchChats() {
      const authStore = useAuthStore();
      
      if (!authStore.isAuthenticated) {
        throw new Error('Пользователь не авторизован');
      }
      
      this.loading = true;
      this.error = null;
      
      try {
        // Используем новый метод API для получения чатов с последними сообщениями
        const chats = await chatService.getChatsWithLastMessages(authStore.getToken);
        
        // Преобразуем список чатов с информацией о последних сообщениях
        this.chats = chats.map(chat => {
          return {
            ...chat,
            lastMessage: chat.last_message?.text || '',
            lastMessageTime: chat.last_message?.timestamp || '',
            unreadCount: chat.unread_count || 0
          };
        });
        
        // Сортируем чаты по времени последнего сообщения
        this._sortChatsByLastMessage();
        
        return chats;
      } catch (error) {
        // Fallback на старый метод в случае ошибки
        try {
          const chats = await chatService.getChats(authStore.getToken);
          this.chats = chats;
          this._sortChatsByLastMessage();
          return chats;
        } catch (fallbackError) {
          this.error = fallbackError.message;
          throw fallbackError;
        }
      } finally {
        this.loading = false;
      }
    },

    // Получение данных о чате по ID
    async fetchChatById(chatId) {
      const authStore = useAuthStore();
      
      if (!authStore.isAuthenticated) {
        throw new Error('Пользователь не авторизован');
      }
      
      this.loading = true;
      this.error = null;
      
      try {
        const chat = await chatService.getChatById(chatId, authStore.getToken);
        
        // Обновляем текущий чат
        this.currentChat = chat;
        
        // Обновляем чат в списке с правильной сортировкой
        this._addChatToSortedList(chat);
        
        return chat;
      } catch (error) {
        this.error = error.message;
        throw error;
      } finally {
        this.loading = false;
      }
    },

    // Создание личного чата
    async createPersonalChat(memberId) {
      const authStore = useAuthStore();
      
      if (!authStore.isAuthenticated) {
        throw new Error('Пользователь не авторизован');
      }
      
      this.loading = true;
      this.error = null;
      
      try {
        const chat = await chatService.createPersonalChat(memberId, authStore.getToken);
        
        // Вместо простого добавления в конец списка, добавляем новый чат с учетом сортировки
        this._addChatToSortedList(chat);
        
        return chat;
      } catch (error) {
        this.error = error.message;
        throw error;
      } finally {
        this.loading = false;
      }
    },

    // Создание группового чата
    async createGroupChat(name, memberIds) {
      const authStore = useAuthStore();
      
      if (!authStore.isAuthenticated) {
        throw new Error('Пользователь не авторизован');
      }
      
      this.loading = true;
      this.error = null;
      
      try {
        const chat = await chatService.createGroupChat(name, memberIds, authStore.getToken);
        
        // Вместо простого добавления в конец списка, добавляем новый чат с учетом сортировки
        this._addChatToSortedList(chat);
        
        return chat;
      } catch (error) {
        this.error = error.message;
        throw error;
      } finally {
        this.loading = false;
      }
    },

    // Загрузка истории сообщений чата
    async fetchChatHistory(chatId, limit = 100, offset = 0) {
      const authStore = useAuthStore();
      
      if (!authStore.isAuthenticated) {
        throw new Error('Пользователь не авторизован');
      }
      
      this.loading = true;
      this.error = null;
      
      try {
        const result = await messageService.getChatHistory(chatId, limit, offset, authStore.getToken);
        
        // Инициализируем массив сообщений для чата, если его еще нет
        if (!this.messages[chatId]) {
          this.messages[chatId] = [];
        }
        
        // Если это первая загрузка (offset=0), то заменяем массив
        // В противном случае добавляем сообщения к существующим
        if (offset === 0) {
          this.messages[chatId] = result.messages;
        } else {
          // Добавляем только те сообщения, которых еще нет в хранилище
          const existingIds = new Set(this.messages[chatId].map(m => m.id));
          const newMessages = result.messages.filter(m => !existingIds.has(m.id));
          this.messages[chatId] = [...this.messages[chatId], ...newMessages];
        }
        
        // Сортируем сообщения по времени, старые сверху, новые снизу
        this.messages[chatId].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        // Если есть сообщения, обновляем информацию о последнем сообщении в чате
        if (this.messages[chatId].length > 0) {
          // После сортировки самое новое сообщение будет последним в массиве
          const newestMessage = this.messages[chatId][this.messages[chatId].length - 1];
          
          // Обновляем превью чата с самым новым сообщением
          this.updateChatPreview(chatId, newestMessage.text, newestMessage.timestamp);
        }
        
        return result;
      } catch (error) {
        this.error = error.message;
        throw error;
      } finally {
        this.loading = false;
      }
    },

    // Отправка сообщения (используется только для истории, реальная отправка через WebSocket)
    async sendMessage(chatId, text) {
      const authStore = useAuthStore();
      
      if (!authStore.isAuthenticated) {
        throw new Error('Пользователь не авторизован');
      }
      
      this.error = null;
      
      try {
        const message = await messageService.sendMessage(chatId, text, authStore.getToken);
        
        // Добавляем сообщение в хранилище
        if (!this.messages[chatId]) {
          this.messages[chatId] = [];
        }
        this.messages[chatId].push(message);
        
        return message;
      } catch (error) {
        this.error = error.message;
        throw error;
      }
    },

    // Пометить сообщение как прочитанное
    async markMessageAsRead(messageId, chatId) {
      const authStore = useAuthStore();
      
      if (!authStore.isAuthenticated) {
        throw new Error('Пользователь не авторизован');
      }
      
      this.error = null;
      
      try {
        const result = await messageService.markMessageAsRead(messageId, authStore.getToken);
        
        // Обновляем статус сообщения в хранилище
        if (this.messages[chatId]) {
          const messageIndex = this.messages[chatId].findIndex(m => m.id === messageId);
          if (messageIndex !== -1) {
            this.messages[chatId][messageIndex].is_read = true;
          }
        }
        
        return result;
      } catch (error) {
        this.error = error.message;
        throw error;
      }
    },

    // Обновление статуса сообщения (для локального UI без обращения к серверу)
    updateMessageStatus(messageId, chatId, isRead) {
      if (this.messages[chatId]) {
        const messageIndex = this.messages[chatId].findIndex(m => m.id === messageId);
        if (messageIndex !== -1) {
          this.messages[chatId][messageIndex].is_read = isRead;
        }
      }
    },

    // Установка текущего чата
    setCurrentChat(chat) {
      this.currentChat = chat;
    },

    // Добавление нового сообщения (для WebSocket)
    addMessage(message) {
      if (!message) {
        console.error('ChatStore: Ошибка: сообщение отсутствует');
        return;
      }
      
      if (!message.chat_id) {
        console.error('ChatStore: Ошибка: chat_id отсутствует в сообщении', message);
        return;
      }
      
      const chatId = message.chat_id;
      console.log(`ChatStore: Добавляем сообщение в чат ${chatId}`);
      
      // Инициализируем массив сообщений для чата, если его еще нет
      if (!this.messages[chatId]) {
        console.log(`ChatStore: Инициализируем массив сообщений для чата ${chatId}`);
        this.messages[chatId] = [];
      }
      
      // Проверяем наличие id в сообщении
      if (!message.id && !message.client_message_id) {
        console.warn('ChatStore: Сообщение не имеет ни server_id, ни client_message_id, генерируем временный id');
        message.client_message_id = uuidv4();
      }
      
      // Определяем id для поиска существующего сообщения
      const messageId = message.id || message.client_message_id;
      
      // Проверяем, не существует ли уже сообщение с таким ID
      const existingIndex = this.messages[chatId].findIndex(m => 
        (m.id && m.id === message.id) || 
        (m.client_message_id && m.client_message_id === message.client_message_id)
      );
      
      if (existingIndex === -1) {
        // Устанавливаем timestamp для сообщения, если его нет
        if (!message.timestamp) {
          console.log(`ChatStore: Устанавливаем timestamp для сообщения в чате ${chatId}`);
          message.timestamp = new Date().toISOString();
        }
        
        console.log(`ChatStore: Добавляем новое сообщение ${messageId} в чат ${chatId}`);
        
        // Добавляем новое сообщение в конец (будет самым новым)
        this.messages[chatId].push(message);
        
        // Сортируем сообщения по времени (старые сверху, новые снизу)
        this.messages[chatId].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        console.log(`ChatStore: В чате ${chatId} теперь ${this.messages[chatId].length} сообщений`);
        
        // Обновляем информацию о чате с последним сообщением
        this.updateChatPreview(chatId, message.text, message.timestamp);
      } else {
        console.log(`ChatStore: Обновляем существующее сообщение ${messageId} в чате ${chatId}`);
        
        // Если серверное сообщение обновляет клиентское, сохраняем серверный ID
        if (message.id && this.messages[chatId][existingIndex].client_message_id && !this.messages[chatId][existingIndex].id) {
          console.log(`ChatStore: Обновляем клиентское сообщение ${this.messages[chatId][existingIndex].client_message_id} серверным ID ${message.id}`);
        }
        
        // Обновляем существующее сообщение, сохраняя важные поля
        this.messages[chatId][existingIndex] = {
          ...this.messages[chatId][existingIndex],
          ...message
        };
      }
    },
    
    // Обновление чата при получении нового сообщения
    updateChatWithLastMessage(message) {
      if (!message || !message.chat_id) return;
      
      const chatId = message.chat_id;
      
      // Устанавливаем timestamp для сообщения, если его нет
      if (!message.timestamp) {
        message.timestamp = new Date().toISOString();
      }
      
      // Найдем чат в списке
      const chatIndex = this.chats.findIndex(chat => chat.id === chatId);
      
      if (chatIndex !== -1) {
        // Обновляем информацию о последнем сообщении и счетчике непрочитанных
        const chat = { ...this.chats[chatIndex] };
        
        // Обновляем последнее сообщение, только если новое сообщение свежее текущего
        const newMessageTime = new Date(message.timestamp);
        const currentMessageTime = chat.lastMessageTime ? new Date(chat.lastMessageTime) : null;
        
        if (!currentMessageTime || newMessageTime > currentMessageTime) {
          chat.lastMessage = message.text;
          chat.lastMessageTime = message.timestamp;
          
          // Увеличиваем счетчик непрочитанных только если:
          // 1. Сообщение не от текущего пользователя
          // 2. Сообщение не прочитано
          // 3. Это не текущий открытый чат
          const authStore = useAuthStore();
          if (message.sender_id !== authStore.getUserId && 
              !message.is_read && 
              (!this.currentChat || this.currentChat.id !== chatId)) {
            chat.unreadCount = (chat.unreadCount || 0) + 1;
          }
          
          // Обновляем чат в списке
          this.chats[chatIndex] = chat;
          
          // Если это текущий открытый чат, обновляем и его
          if (this.currentChat && this.currentChat.id === chatId) {
            this.currentChat = chat;
          }
          
          // Сортируем список чатов по времени последнего сообщения
          this._sortChatsByLastMessage();
        }
      } else {
        console.log(`Чат с ID ${chatId} не найден в списке, загружаем информацию о нем`);
        this.fetchChatById(chatId).catch(error => {
          console.error('Ошибка при загрузке информации о чате:', error);
        });
      }
      
      // Если это текущий открытый чат, добавляем сообщение в список сообщений
      if (this.currentChat && this.currentChat.id === chatId) {
        this.addMessage(message);
      }
    },

    // Добавление нового чата в отсортированный список
    _addChatToSortedList(chat) {
      const index = this.chats.findIndex(c => c.id === chat.id);
      if (index !== -1) {
        this.chats[index] = chat;
      } else {
        this.chats.push(chat);
      }
      
      // Сортируем список чатов по времени последнего сообщения
      this._sortChatsByLastMessage();
    },
    
    // Приватный метод для сортировки чатов по времени последнего сообщения
    _sortChatsByLastMessage() {
      if (!this.chats || this.chats.length <= 1) {
        return; // Нечего сортировать
      }
      
      console.log('Сортировка чатов по времени последнего сообщения');
      
      // Сохраняем порядок чатов до сортировки для проверки
      const chatIdsBeforeSort = this.chats.map(chat => ({
        id: chat.id,
        time: chat.lastMessageTime
      }));
      
      this.chats.sort((a, b) => {
        // Если нет времени последнего сообщения, ставим в конец
        if (!a.lastMessageTime) return 1;
        if (!b.lastMessageTime) return -1;
        
        // Сортировка по убыванию (новые сверху)
        return new Date(b.lastMessageTime) - new Date(a.lastMessageTime);
      });
      
      // Логируем порядок чатов после сортировки
      const chatIdsAfterSort = this.chats.map(chat => ({
        id: chat.id,
        time: chat.lastMessageTime
      }));
      
      console.log('Результат сортировки чатов:', {
        before: chatIdsBeforeSort,
        after: chatIdsAfterSort
      });
    },

    // Метод для обновления превью чата без изменения порядка сообщений
    updateChatPreview(chatId, messageText, messageTime) {
      if (!chatId || !messageText || !messageTime) {
        console.error('Ошибка в updateChatPreview: отсутствуют обязательные параметры', { chatId, messageText, messageTime });
        return;
      }
      
      const chatIndex = this.chats.findIndex(chat => chat.id === chatId);
      
      if (chatIndex === -1) {
        console.log(`Чат с ID ${chatId} не найден в списке, загружаем информацию о нем`);
        // Если чата нет в списке, загрузим его информацию
        this.fetchChatById(chatId).catch(error => {
          console.error('Ошибка при загрузке информации о чате:', error);
        });
        return;
      }
      
      // Обновляем информацию о последнем сообщении в чате
      const chatToUpdate = { ...this.chats[chatIndex] };
      
      // Преобразуем время в объекты Date для корректного сравнения
      const newMessageTime = new Date(messageTime);
      const currentMessageTime = chatToUpdate.lastMessageTime ? new Date(chatToUpdate.lastMessageTime) : null;
      
      // Обновляем только если новое сообщение свежее текущего или текущего нет
      if (!currentMessageTime || newMessageTime > currentMessageTime) {
        console.log(`Обновляем превью чата ${chatId} новым сообщением`);
        chatToUpdate.lastMessage = messageText;
        chatToUpdate.lastMessageTime = messageTime;
        
        // Обновляем чат в текущей позиции
        this.chats[chatIndex] = chatToUpdate;
        
        // Сортируем чаты по времени последнего сообщения
        this._sortChatsByLastMessage();
        
        // Если это текущий открытый чат, обновляем и его
        if (this.currentChat && this.currentChat.id === chatId) {
          this.currentChat = chatToUpdate;
        }
      } else {
        console.log(`Сообщение для чата ${chatId} не является новейшим, пропускаем обновление превью`);
      }
    },

    // Инициализировать подключение к глобальному WebSocket
    initGlobalWebSocket() {
      const authStore = useAuthStore();
      if (!authStore.isAuthenticated) {
        console.warn('Нельзя инициализировать глобальный WebSocket без авторизации');
        return;
      }
      
      // Проверяем, был ли уже инициализирован глобальный WebSocket
      if (this.globalWebSocketInitialized) {
        console.log('Глобальный WebSocket уже инициализирован, пропускаем повторную инициализацию');
        return;
      }
      
      console.log('Инициализация глобального WebSocket');
      
      // Отключаем предыдущее подключение, если есть
      webSocketService.disconnectGlobal();
      
      // Подключаемся к глобальному WebSocket
      webSocketService.connectGlobal(authStore.getToken);
      
      // Устанавливаем обработчики для глобальных сообщений
      webSocketService.onGlobalMessage(this.handleGlobalMessage.bind(this));
      webSocketService.onStatusChange(this.handleWebSocketStatus.bind(this));
      webSocketService.onError(this.handleWebSocketError.bind(this));
      
      // Меняем статус подключения
      this.globalWebSocketStatus = 'connecting';
      this.globalWebSocketInitialized = true;
    },
    
    // Обработчик для глобальных сообщений
    handleGlobalMessage(message) {
      console.log('Получено глобальное сообщение:', message);
      
      if (!message || !message.chat_id) {
        console.error('Ошибка: в глобальном сообщении отсутствует chat_id');
        return;
      }
      
      // Проверяем, обрабатывали ли мы уже это сообщение для уведомлений
      const messageId = message.id || message.client_message_id;
      const cacheKey = `notification-${messageId}-${message.chat_id}`;
      
      if (this.notificationCache.has(cacheKey)) {
        console.log(`Сообщение ${messageId} уже было обработано для уведомлений, пропускаем`);
        return;
      }
      
      // Добавляем сообщение в кэш уведомлений
      this.notificationCache.add(cacheKey);
      
      // Ограничиваем размер кэша
      if (this.notificationCache.size > 100) {
        const firstItem = this.notificationCache.values().next().value;
        this.notificationCache.delete(firstItem);
      }
      
      // Получаем ID текущего пользователя
      const authStore = useAuthStore();
      const currentUserId = authStore.getUserId;
      
      // Обновляем информацию о чате с последним сообщением
      this.updateChatWithLastMessage(message);
      
      // Проверяем, является ли сообщение от другого пользователя (не от текущего)
      if (message.sender_id !== currentUserId) {
        // Показываем уведомление о новом сообщении, только если это не текущий открытый чат
        if (!this.currentChat || this.currentChat.id !== message.chat_id) {
          const chat = this.chats.find(c => c.id === message.chat_id);
          if (chat) {
            this.showMessageNotification(message, chat);
          }
        }
      }
      
      // Если чат с таким ID еще не загружен, загружаем его
      const chatExists = this.chats.some(chat => chat.id === message.chat_id);
      if (!chatExists) {
        this.fetchChatById(message.chat_id).catch(error => {
          console.error(`Ошибка при загрузке чата ${message.chat_id}:`, error);
        });
      }
    },
    
    // Показ уведомления о новом сообщении
    showMessageNotification(message, chat) {
      try {
        // Пропускаем уведомления от себя
        const authStore = useAuthStore();
        if (message.sender_id === authStore.getUserId) {
          return;
        }
        
        // Создаем экземпляр toast уведомления
        const toast = useToast();
        
        // Формируем текст уведомления
        const senderName = message.sender_name || 'Неизвестный отправитель';
        const chatName = chat.name || this.getChatName(chat);
        const messageText = message.text.length > 30 
          ? message.text.substring(0, 30) + '...' 
          : message.text;
          
        // Отображаем уведомление
        toast.info(`${senderName} в ${chatName}: ${messageText}`, {
          timeout: 5000,
          onClick: () => {
            // При клике на уведомление открываем чат
            this.setCurrentChat(chat);
            // Если используется маршрутизация Vue Router
            try {
              const router = window.router; // Предполагается, что роутер доступен глобально
              if (router) {
                router.push({ name: 'chat', params: { id: chat.id } });
              }
            } catch (e) {
              console.error('Ошибка при переходе к чату:', e);
            }
          }
        });
      } catch (error) {
        console.error('Ошибка при отображении уведомления:', error);
      }
    },
    
    // Получить название чата для отображения
    getChatName(chat) {
      if (chat.name) return chat.name;
      
      // Если это личный чат, вернем имя собеседника
      if (chat.type === 'personal' && chat.members && chat.members.length > 0) {
        const authStore = useAuthStore();
        const currentUserId = authStore.getUserId;
        
        // Найдем собеседника (не текущего пользователя)
        const otherMember = chat.members.find(m => m.id !== currentUserId);
        if (otherMember) {
          return otherMember.name || otherMember.email || 'Собеседник';
        }
      }
      
      return 'Чат';
    },
    
    // Обработчик статуса WebSocket
    handleWebSocketStatus(status) {
      console.log('Изменение статуса WebSocket:', status);
      
      if (status.status === 'global_connected') {
        this.globalWebSocketStatus = 'connected';
      } else if (status.status === 'global_disconnected' || status.status === 'global_failed') {
        this.globalWebSocketStatus = 'disconnected';
        
        // Пытаемся восстановить соединение через некоторое время
        setTimeout(() => {
          if (this.globalWebSocketStatus === 'disconnected') {
            console.log('Попытка восстановить глобальное WebSocket-соединение');
            // Сбрасываем флаг инициализации перед переподключением
            this.globalWebSocketInitialized = false;
            this.initGlobalWebSocket();
          }
        }, 5000); // Повторная попытка через 5 секунд
      } else if (status.status === 'global_reconnecting') {
        this.globalWebSocketStatus = 'reconnecting';
      }
    },
    
    // Обработчик ошибок WebSocket
    handleWebSocketError(error) {
      console.error('Ошибка WebSocket:', error);
      this.error = error;
    },

    // Обновить счетчик непрочитанных сообщений для чата
    updateUnreadCount(chatId, count) {
      const chatIndex = this.chats.findIndex(chat => chat.id === chatId);
      if (chatIndex !== -1) {
        const chat = { ...this.chats[chatIndex] };
        chat.unreadCount = Math.max(0, count); // Убеждаемся, что счетчик не отрицательный
        this.chats[chatIndex] = chat;
        
        // Если это текущий открытый чат, обновляем и его
        if (this.currentChat && this.currentChat.id === chatId) {
          this.currentChat = { ...this.currentChat, unreadCount: chat.unreadCount };
        }
      }
    },
    
    // Сбросить счетчик непрочитанных сообщений для чата
    resetUnreadCount(chatId) {
      this.updateUnreadCount(chatId, 0);
    },
    
    // Пометить все сообщения в чате как прочитанные
    async markAllMessagesAsRead(chatId) {
      const authStore = useAuthStore();
      
      if (!authStore.isAuthenticated) {
        throw new Error('Пользователь не авторизован');
      }
      
      this.resetUnreadCount(chatId);
      
      // Получаем все непрочитанные сообщения в текущем чате
      if (this.messages[chatId]) {
        const unreadMessages = this.messages[chatId].filter(
          msg => !msg.is_read && msg.sender_id !== authStore.getUserId
        );
        
        // Отмечаем каждое сообщение как прочитанное
        for (const message of unreadMessages) {
          try {
            await this.markMessageAsRead(message.id, chatId);
          } catch (error) {
            console.error(`Ошибка при отметке сообщения ${message.id} как прочитанного:`, error);
          }
        }
      }
    }
  }
}); 