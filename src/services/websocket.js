import { WS_BASE_URL } from '../config';
import { v4 as uuidv4 } from 'uuid';

export class WebSocketService {
  constructor() {
    this.socket = null;
    this.globalSocket = null; // WebSocket для глобальных уведомлений пользователя
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectInterval = 3000; // 3 секунды
    this.messageCallbacks = [];
    this.globalMessageCallbacks = []; // Обработчики для глобальных сообщений
    this.statusCallbacks = [];
    this.errorCallbacks = [];
    this.pendingMessages = new Set();
    this.messageCache = new Set(); // Для предотвращения дублирования сообщений
  }

  // Подключение к чату
  connect(chatId, token) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.log(`Отключаемся от текущего WebSocket перед подключением к чату ${chatId}`);
      this.disconnect();
    }

    try {
      console.log(`Подключаемся к WebSocket для чата ${chatId}`);
      this.socket = new WebSocket(`${WS_BASE_URL}/${chatId}?token=${token}`);
      
      this.socket.onopen = () => {
        console.log(`WebSocket успешно подключен к чату ${chatId}`);
        this.reconnectAttempts = 0;
        this._notifyStatusCallbacks({ status: 'connected', chatId });
        
        // Отправляем накопившиеся сообщения
        this._sendPendingMessages();
      };
      
      this.socket.onmessage = (event) => {
        try {
          console.log(`Получены данные WebSocket для чата ${chatId}:`, event.data);
          const data = JSON.parse(event.data);
          
          if (data.error) {
            console.error(`WebSocket ошибка для чата ${chatId}:`, data.error);
            this._notifyErrorCallbacks(data.error);
            return;
          }
          
          if (data.type === 'message') {
            // Проверяем кэш, чтобы избежать дублирования сообщений
            const messageId = data.data.id;
            console.log(`Получено сообщение с ID ${messageId} для чата ${chatId}`);
            
            if (!this.messageCache.has(messageId)) {
              this.messageCache.add(messageId);
              // Ограничиваем размер кэша
              if (this.messageCache.size > 100) {
                const firstItem = this.messageCache.values().next().value;
                this.messageCache.delete(firstItem);
              }
              this._notifyMessageCallbacks(data.data);
            } else {
              console.log(`Сообщение с ID ${messageId} уже обработано, пропускаем`);
            }
          } else {
            console.log(`Получено обновление статуса для чата ${chatId}:`, data);
            this._notifyStatusCallbacks(data);
          }
        } catch (error) {
          console.error(`Ошибка при обработке сообщения WebSocket для чата ${chatId}:`, error);
        }
      };
      
      this.socket.onclose = (event) => {
        if (!event.wasClean) {
          console.log(`Соединение прервано для чата ${chatId}, код: ${event.code}`);
          this._tryReconnect(chatId, token);
        } else {
          console.log(`Соединение закрыто для чата ${chatId}, код: ${event.code}`);
          this._notifyStatusCallbacks({ status: 'disconnected', chatId });
        }
      };
      
      this.socket.onerror = (error) => {
        console.error(`Ошибка WebSocket для чата ${chatId}:`, error);
        this._notifyErrorCallbacks(`Ошибка соединения WebSocket для чата ${chatId}`);
      };
      
    } catch (error) {
      console.error(`Ошибка при создании WebSocket для чата ${chatId}:`, error);
      this._notifyErrorCallbacks(`Не удалось создать подключение WebSocket для чата ${chatId}`);
    }
  }

  // Подключение к глобальному WebSocket пользователя
  connectGlobal(token) {
    if (this.globalSocket && this.globalSocket.readyState === WebSocket.OPEN) {
      console.log(`Отключаемся от текущего глобального WebSocket перед переподключением`);
      this.disconnectGlobal();
    }

    try {
      console.log(`Подключаемся к глобальному WebSocket пользователя`);
      this.globalSocket = new WebSocket(`${WS_BASE_URL}/user?token=${token}`);
      
      this.globalSocket.onopen = () => {
        console.log(`Глобальный WebSocket успешно подключен`);
        this._notifyStatusCallbacks({ status: 'global_connected' });
      };
      
      this.globalSocket.onmessage = (event) => {
        try {
          console.log(`Получены данные глобального WebSocket:`, event.data);
          const data = JSON.parse(event.data);
          
          if (data.error) {
            console.error(`Глобальный WebSocket ошибка:`, data.error);
            this._notifyErrorCallbacks(data.error);
            return;
          }
          
          if (data.type === 'message') {
            const messageId = data.data.id;
            console.log(`Получено глобальное сообщение с ID ${messageId} для чата ${data.data.chat_id}`);
            
            if (!this.messageCache.has(messageId)) {
              this.messageCache.add(messageId);
              // Ограничиваем размер кэша
              if (this.messageCache.size > 100) {
                const firstItem = this.messageCache.values().next().value;
                this.messageCache.delete(firstItem);
              }
              this._notifyGlobalMessageCallbacks(data.data);
            } else {
              console.log(`Глобальное сообщение с ID ${messageId} уже обработано, пропускаем`);
            }
          } else {
            console.log(`Получено обновление статуса глобального WebSocket:`, data);
            this._notifyStatusCallbacks(data);
          }
        } catch (error) {
          console.error(`Ошибка при обработке сообщения глобального WebSocket:`, error);
        }
      };
      
      this.globalSocket.onclose = (event) => {
        if (!event.wasClean) {
          console.log(`Глобальное соединение прервано, код: ${event.code}`);
          this._tryReconnectGlobal(token);
        } else {
          console.log(`Глобальное соединение закрыто, код: ${event.code}`);
          this._notifyStatusCallbacks({ status: 'global_disconnected' });
        }
      };
      
      this.globalSocket.onerror = (error) => {
        console.error(`Ошибка глобального WebSocket:`, error);
        this._notifyErrorCallbacks(`Ошибка глобального соединения WebSocket`);
      };
      
    } catch (error) {
      console.error(`Ошибка при создании глобального WebSocket:`, error);
      this._notifyErrorCallbacks(`Не удалось создать глобальное подключение WebSocket`);
    }
  }

  // Отключение от чата
  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  // Отключение от глобального WebSocket
  disconnectGlobal() {
    if (this.globalSocket) {
      this.globalSocket.close();
      this.globalSocket = null;
    }
  }
  
  // Отправка сообщения в чат
  sendMessage(text) {
    const messageData = { 
      text,
      client_message_id: uuidv4(), // Добавляем идентификатор для отслеживания сообщений
      timestamp: new Date().toISOString() // Добавляем клиентскую временную метку
    };
    
    // Добавляем chat_id из URL WebSocket, если есть соединение
    if (this.socket) {
      try {
        const wsUrl = this.socket.url;
        const chatIdMatch = wsUrl.match(/\/([^\/\?]+)\?/);
        if (chatIdMatch && chatIdMatch[1]) {
          const chatId = chatIdMatch[1];
          console.log(`Добавляем chat_id=${chatId} в исходящее сообщение`);
          messageData.chat_id = chatId;
        }
      } catch (error) {
        console.error('Ошибка при попытке извлечь chat_id из URL WebSocket:', error);
      }
    }
    
    console.log('Отправка сообщения через WebSocket:', {
      text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
      client_message_id: messageData.client_message_id,
      timestamp: messageData.timestamp,
      chat_id: messageData.chat_id || 'не определен'
    });
    
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      const messageJson = JSON.stringify(messageData);
      console.log('WebSocket открыт, отправляем сообщение');
      this.socket.send(messageJson);
    } else {
      // Сохраняем сообщение для отправки после восстановления соединения
      const messageJson = JSON.stringify(messageData);
      console.warn('WebSocket не открыт, сохраняем сообщение для отправки позже');
      this.pendingMessages.add(messageJson);
      this._notifyErrorCallbacks('Нет активного соединения. Сообщение будет отправлено после восстановления подключения.');
    }
    
    return messageData.client_message_id; // Возвращаем ID сообщения для отслеживания
  }

  // Отправка накопившихся сообщений
  _sendPendingMessages() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN && this.pendingMessages.size > 0) {
      console.log('Отправка отложенных сообщений:', this.pendingMessages.size);
      
      for (const messageData of this.pendingMessages) {
        this.socket.send(messageData);
      }
      
      this.pendingMessages.clear();
    }
  }

  // Добавление обработчика для сообщений
  onMessage(callback) {
    this.messageCallbacks.push(callback);
    return () => {
      this.messageCallbacks = this.messageCallbacks.filter(cb => cb !== callback);
    };
  }

  // Добавление обработчика для глобальных сообщений
  onGlobalMessage(callback) {
    this.globalMessageCallbacks.push(callback);
    return () => {
      this.globalMessageCallbacks = this.globalMessageCallbacks.filter(cb => cb !== callback);
    };
  }

  // Добавление обработчика для статуса подключения
  onStatusChange(callback) {
    this.statusCallbacks.push(callback);
    return () => {
      this.statusCallbacks = this.statusCallbacks.filter(cb => cb !== callback);
    };
  }

  // Добавление обработчика для ошибок
  onError(callback) {
    this.errorCallbacks.push(callback);
    return () => {
      this.errorCallbacks = this.errorCallbacks.filter(cb => cb !== callback);
    };
  }

  // Попытка переподключения при обрыве соединения
  _tryReconnect(chatId, token) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Попытка переподключения ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);
      
      setTimeout(() => {
        this.connect(chatId, token);
      }, this.reconnectInterval);
      
      this._notifyStatusCallbacks({ 
        status: 'reconnecting', 
        attempt: this.reconnectAttempts, 
        maxAttempts: this.maxReconnectAttempts 
      });
    } else {
      this._notifyErrorCallbacks('Не удалось установить соединение после нескольких попыток');
      this._notifyStatusCallbacks({ status: 'failed' });
    }
  }

  // Попытка переподключения глобального WebSocket при обрыве соединения
  _tryReconnectGlobal(token) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Попытка переподключения глобального WebSocket ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);
      
      setTimeout(() => {
        this.connectGlobal(token);
      }, this.reconnectInterval);
      
      this._notifyStatusCallbacks({ 
        status: 'global_reconnecting', 
        attempt: this.reconnectAttempts, 
        maxAttempts: this.maxReconnectAttempts 
      });
    } else {
      this._notifyErrorCallbacks('Не удалось установить глобальное соединение после нескольких попыток');
      this._notifyStatusCallbacks({ status: 'global_failed' });
    }
  }

  // Оповещение обработчиков о новых сообщениях
  _notifyMessageCallbacks(message) {
    console.log('Начало обработки сообщения через WebSocket:', message);
    
    // Проверяем и устанавливаем временную метку, если её нет
    if (!message.timestamp) {
      console.log(`Устанавливаем временную метку для сообщения ${message.id || 'без ID'}`);
      message.timestamp = new Date().toISOString();
    }
    
    // Проверяем, есть ли chat_id в сообщении
    if (!message.chat_id && this.socket) {
      // Извлекаем chat_id из URL WebSocket соединения
      try {
        const wsUrl = this.socket.url;
        const chatIdMatch = wsUrl.match(/\/([^\/\?]+)\?/);
        if (chatIdMatch && chatIdMatch[1]) {
          const chatId = chatIdMatch[1];
          console.log(`Устанавливаем chat_id=${chatId} для сообщения ${message.id || 'без ID'}, так как он отсутствует`);
          message.chat_id = chatId;
        } else {
          console.warn(`Не удалось извлечь chat_id из URL WebSocket: ${wsUrl}`);
        }
      } catch (error) {
        console.error('Ошибка при попытке извлечь chat_id из URL WebSocket:', error);
      }
    }
    
    // Логируем сообщение перед отправкой обработчикам
    console.log(`Отправляем сообщение ${message.id || 'без ID'} для чата ${message.chat_id || 'неизвестно'} в ${this.messageCallbacks.length} обработчиков`);
    
    if (this.messageCallbacks.length === 0) {
      console.warn('Нет активных обработчиков сообщений!');
    }
    
    this.messageCallbacks.forEach((callback, index) => {
      try {
        console.log(`Вызов обработчика №${index + 1} для сообщения ${message.id || 'без ID'}`);
        callback(message);
      } catch (error) {
        console.error(`Ошибка в обработчике №${index + 1} для сообщения ${message.id || 'без ID'}:`, error);
      }
    });
  }

  // Оповещение обработчиков о новых глобальных сообщениях
  _notifyGlobalMessageCallbacks(message) {
    console.log('Начало обработки глобального сообщения через WebSocket:', message);
    
    // Проверяем и устанавливаем временную метку, если её нет
    if (!message.timestamp) {
      console.log(`Устанавливаем временную метку для глобального сообщения ${message.id || 'без ID'}`);
      message.timestamp = new Date().toISOString();
    }
    
    // Логируем сообщение перед отправкой обработчикам
    console.log(`Отправляем глобальное сообщение ${message.id || 'без ID'} для чата ${message.chat_id || 'неизвестно'} в ${this.globalMessageCallbacks.length} обработчиков`);
    
    if (this.globalMessageCallbacks.length === 0) {
      console.warn('Нет активных обработчиков глобальных сообщений!');
    }
    
    this.globalMessageCallbacks.forEach((callback, index) => {
      try {
        console.log(`Вызов обработчика глобальных сообщений №${index + 1} для сообщения ${message.id || 'без ID'}`);
        callback(message);
      } catch (error) {
        console.error(`Ошибка в обработчике глобальных сообщений №${index + 1} для сообщения ${message.id || 'без ID'}:`, error);
      }
    });
  }

  // Оповещение обработчиков о изменении статуса
  _notifyStatusCallbacks(status) {
    this.statusCallbacks.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        console.error('Ошибка в обработчике статуса:', error);
      }
    });
  }

  // Оповещение обработчиков об ошибках
  _notifyErrorCallbacks(error) {
    this.errorCallbacks.forEach(callback => {
      try {
        callback(error);
      } catch (err) {
        console.error('Ошибка в обработчике ошибок:', err);
      }
    });
  }
}

// Экспорт экземпляра сервиса
export const webSocketService = new WebSocketService(); 