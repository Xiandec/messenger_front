<template>
  <div class="chat-container" v-if="currentChat">
    <div class="chat-header">
      <div class="chat-avatar">
        {{ getChatInitials(currentChat) }}
      </div>
      <div class="chat-header-info">
        <h3 class="chat-title">{{ getChatName(currentChat) }}</h3>
        <div class="chat-status" v-if="chatStatus">{{ chatStatus }}</div>
      </div>
    </div>
    
    <div 
      class="messages-container" 
      ref="messagesContainer"
      @scroll="handleScroll"
    >
      <div v-if="loading" class="messages-loading">
        Загрузка сообщений...
      </div>
      
      <div v-else-if="messages.length === 0" class="no-messages">
        Нет сообщений. Начните общение!
      </div>
      
      <div v-else>
        <div v-if="canLoadMore && !loading" class="load-more-container">
          <button @click="loadMoreMessages" class="btn btn-secondary load-more-btn">
            Загрузить ещё
          </button>
        </div>
        
        <div class="messages-list">
          <div 
            v-for="message in messages" 
            :key="message.id" 
            class="message-item" 
            :class="{ 'message-mine': message.sender_id === userId }"
          >
            <div class="message-avatar" v-if="message.sender_id !== userId">
              {{ getInitials(message.sender?.name || 'User') }}
            </div>
            <div class="message-content">
              <div class="message-header">
                <span class="message-sender" v-if="message.sender_id !== userId && currentChat.type === 'group'">
                  {{ message.sender?.name || message.sender_name || 'Пользователь' }}
                </span>
                <span class="message-time">
                  {{ formatTime(message.timestamp) }}
                </span>
              </div>
              <div class="message-text">{{ message.text }}</div>
              <div class="message-status" v-if="message.sender_id === userId">
                {{ message.is_read ? 'Прочитано' : 'Отправлено' }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="message-input-container">
      <textarea 
        class="message-input" 
        v-model="newMessage" 
        placeholder="Введите сообщение..." 
        @keydown.enter.prevent="sendMessage"
        ref="messageInput"
      ></textarea>
      <button 
        class="btn send-button" 
        @click="sendMessage" 
        :disabled="!newMessage.trim() || sendingMessage"
      >
        {{ sendingMessage ? 'Отправка...' : 'Отправить' }}
      </button>
    </div>
  </div>
  
  <div class="no-chat-selected" v-else>
    <p>Выберите чат из списка слева или создайте новый</p>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useChatStore } from '../stores/chat';
import { webSocketService } from '../services/websocket';
import { useToast } from 'vue-toastification';

const route = useRoute();
const authStore = useAuthStore();
const chatStore = useChatStore();
const toast = useToast();

const messagesContainer = ref(null);
const messageInput = ref(null);
const newMessage = ref('');
const loading = ref(false);
const error = ref('');
const chatId = ref(route.params.id);
const messages = computed(() => chatStore.getMessages(chatId.value) || []);
const currentChat = computed(() => chatStore.getCurrentChat);
const userId = computed(() => authStore.getUserId);
const chatStatus = ref('');
const offset = ref(0);
const limit = ref(50);
const canLoadMore = ref(false);
const totalMessages = ref(0);
const sendingMessage = ref(false);
const isAtBottom = ref(true);

// Переменные для хранения функций отписки от WebSocket
const unsubscribeMessage = ref(null);
const unsubscribeStatus = ref(null);
const unsubscribeError = ref(null);

// Установка чата по умолчанию
onMounted(async () => {
  console.log('ChatView: onMounted вызван');
  if (!authStore.isAuthenticated) {
    console.log('ChatView: пользователь не авторизован');
    return;
  }
  
  // Добавляем обработчик события загрузки изображений
  window.addEventListener('load', handleContentLoaded);
  
  // Если был передан ID чата в параметрах, загружаем его
  if (chatId.value) {
    console.log('ChatView: загрузка чата с ID:', chatId.value);
    await loadChat();
  }
});

// Следим за изменением ID чата в URL
watch(() => route.params.id, async (newId) => {
  if (newId && newId !== chatId.value) {
    chatId.value = newId;
    await loadChat();
  }
});

// Загрузка информации о чате и истории сообщений
async function loadChat() {
  try {
    loading.value = true;
    
    // Получаем информацию о чате
    await chatStore.fetchChatById(chatId.value);
    
    // Сбрасываем счетчик непрочитанных сообщений в UI сразу
    chatStore.resetUnreadCount(chatId.value);
    
    // Сбрасываем параметры загрузки сообщений
    offset.value = 0;
    
    // Загружаем историю сообщений через REST API
    const result = await chatStore.fetchChatHistory(chatId.value, limit.value, offset.value);
    totalMessages.value = result.total;
    canLoadMore.value = messages.value.length < totalMessages.value;
    
    // Отмечаем все непрочитанные сообщения от других пользователей как прочитанные
    await chatStore.markAllMessagesAsRead(chatId.value);
    
    // Подключаемся к чату через WebSocket для получения новых сообщений
    setupWebSocket();
    
    // Используем nextTick, чтобы дождаться обновления DOM перед прокруткой
    await nextTick();
    
    // Гарантированно прокручиваем к последнему сообщению после загрузки
    scrollToBottom();
    console.log('Прокрутка к последнему сообщению выполнена');
    
    // Добавляем небольшую задержку, чтобы учесть возможную задержку отрисовки
    setTimeout(() => {
      scrollToBottom();
    }, 200);
    
    // Устанавливаем фокус в поле ввода
    messageInput.value?.focus();
  } catch (err) {
    error.value = err.message;
    console.error('Ошибка при загрузке чата:', err);
  } finally {
    loading.value = false;
  }
}

// Загрузка дополнительных сообщений при скролле
async function loadMoreMessages() {
  if (loading.value || !canLoadMore.value) {
    return;
  }
  
  try {
    loading.value = true;
    
    // Измеряем высоту всех сообщений перед загрузкой новых
    const firstVisibleMessageElement = messagesContainer.value.querySelector('.message-item');
    let firstVisibleMessageOffsetTop = 0;
    
    if (firstVisibleMessageElement) {
      firstVisibleMessageOffsetTop = firstVisibleMessageElement.offsetTop;
    }
    
    // Увеличиваем смещение для загрузки следующей страницы
    offset.value += limit.value;
    
    // Загружаем дополнительные сообщения
    const result = await chatStore.fetchChatHistory(chatId.value, limit.value, offset.value);
    
    // Проверяем, можно ли загрузить еще
    canLoadMore.value = messages.value.length < totalMessages.value;
    
    // Отмечаем новые сообщения от других пользователей как прочитанные
    const newMessages = result.messages;
    if (newMessages && newMessages.length > 0) {
      // Проверяем, есть ли сообщения от других пользователей
      const hasOtherUsersMessages = newMessages.some(msg => msg.sender_id !== userId.value);
      
      // Отмечаем непрочитанные сообщения от других пользователей
      const unreadMessages = newMessages.filter(
        msg => !msg.is_read && msg.sender_id !== userId.value
      );
      
      unreadMessages.forEach(message => {
        markMessageAsRead(message.id);
      });
      
      // Если есть сообщения от других пользователей, отмечаем и свои как прочитанные
      if (hasOtherUsersMessages) {
        // Находим свои непрочитанные сообщения среди новых
        const unreadOwnMessages = newMessages.filter(
          msg => !msg.is_read && msg.sender_id === userId.value
        );
        
        unreadOwnMessages.forEach(message => {
          chatStore.updateMessageStatus(message.id, chatId.value, true);
        });
      }
    }
    
    // Дожидаемся обновления DOM
    await nextTick();
    
    // Находим снова то же самое сообщение после загрузки и прокручиваем к нему
    // Это сохранит позицию прокрутки на том же сообщении, что было видно до загрузки
    if (firstVisibleMessageElement) {
      const sameMessageElements = messagesContainer.value.querySelectorAll('.message-item');
      const sameMessageElement = Array.from(sameMessageElements).find(el => {
        return el.offsetTop >= firstVisibleMessageOffsetTop;
      });
      
      if (sameMessageElement) {
        sameMessageElement.scrollIntoView({ block: 'start' });
      }
    }
  } catch (err) {
    console.error('Ошибка при загрузке дополнительных сообщений:', err);
  } finally {
    loading.value = false;
  }
}

// Обработка события скролла
function handleScroll() {
  if (!messagesContainer.value) return;
  
  // Проверяем, находится ли пользователь внизу чата
  const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value;
  isAtBottom.value = scrollHeight - scrollTop - clientHeight < 50;
  
  // Проверяем, какие сообщения стали видимыми, и отмечаем их как прочитанные
  checkVisibleMessages();
}

// Проверка видимых сообщений и отметка их как прочитанных
function checkVisibleMessages() {
  if (!messagesContainer.value || !messages.value.length) return;
  
  // Получаем все элементы сообщений
  const messageElements = messagesContainer.value.querySelectorAll('.message-item');
  
  // Определяем видимую область контейнера
  const containerRect = messagesContainer.value.getBoundingClientRect();
  
  // Флаг, показывающий, что в чате есть сообщения от других пользователей
  const hasOtherUsersMessages = messages.value.some(msg => msg.sender_id !== userId.value);
  
  // Проходим по всем сообщениям
  for (let i = 0; i < messageElements.length && i < messages.value.length; i++) {
    const messageElement = messageElements[i];
    const messageRect = messageElement.getBoundingClientRect();
    
    // Проверяем, находится ли сообщение в видимой области
    const isVisible = (
      messageRect.top >= containerRect.top - messageRect.height &&
      messageRect.bottom <= containerRect.bottom + messageRect.height
    );
    
    if (isVisible) {
      // Получаем сообщение
      const message = messages.value[i];
      
      if (!message) continue;
      
      // Если сообщение от другого пользователя и не прочитано, отмечаем его как прочитанное
      if (message.sender_id !== userId.value && !message.is_read) {
        markMessageAsRead(message.id);
      }
      
      // Если есть сообщения от других пользователей и это наше непрочитанное сообщение,
      // обновляем его статус
      if (hasOtherUsersMessages && message.sender_id === userId.value && !message.is_read) {
        chatStore.updateMessageStatus(message.id, chatId.value, true);
      }
    }
  }
}

// Подключение к чату через WebSocket
function setupWebSocket() {
  if (chatId.value) {
    // Отключаемся от предыдущего соединения
    if (unsubscribeMessage.value) unsubscribeMessage.value();
    if (unsubscribeStatus.value) unsubscribeStatus.value();
    if (unsubscribeError.value) unsubscribeError.value();
    webSocketService.disconnect();
    
    // Подключаемся к новому чату
    webSocketService.connect(chatId.value, authStore.token);
    
    // Подписываемся на получение новых сообщений 
    unsubscribeMessage.value = webSocketService.onMessage((message) => {
      console.log('ChatView: Получено новое сообщение через WebSocket:', message);
      
      // Проверяем, соответствует ли сообщение текущему чату
      if (message.chat_id && message.chat_id !== chatId.value) {
        console.log(`ChatView: Сообщение для чата ${message.chat_id}, пропускаем, так как открыт чат ${chatId.value}`);
        return;
      }
      
      // Если chat_id отсутствует, устанавливаем текущий chatId
      if (!message.chat_id) {
        console.log(`ChatView: Устанавливаем chat_id=${chatId.value} для сообщения, так как он отсутствует`);
        message.chat_id = chatId.value;
      }
      
      // Убеждаемся, что timestamp существует
      if (!message.timestamp) {
        console.log('ChatView: Устанавливаем временную метку для сообщения');
        message.timestamp = new Date().toISOString();
      }
      
      // Кэшируем ID сообщения, чтобы избежать дублирующей обработки
      const messageId = message.id || message.client_message_id;
      const processingCacheKey = `chat-processing-${messageId}-${chatId.value}`;
      
      // Проверяем, не обрабатывали ли мы уже это сообщение 
      if (window[processingCacheKey]) {
        console.log(`ChatView: Сообщение ${messageId} для чата ${chatId.value} уже обрабатывается, пропускаем`);
        return;
      }
      
      // Устанавливаем флаг обработки и очищаем его через короткое время
      window[processingCacheKey] = true;
      setTimeout(() => {
        window[processingCacheKey] = false;
      }, 5000); // Сбрасываем флаг через 5 секунд
      
      // Добавляем сообщение в чат через хранилище, если его еще нет
      const messageExists = messages.value.some(m => 
        (m.id && m.id === message.id) || 
        (m.client_message_id && message.client_message_id && m.client_message_id === message.client_message_id)
      );
      
      if (!messageExists) {
        console.log(`ChatView: Добавляем новое сообщение ${messageId} в чат ${message.chat_id}`);
        chatStore.addMessage(message);
        
        // Прокручиваем к новому сообщению
        nextTick(() => {
          scrollToBottom();
        });
        
        // Если сообщение от другого пользователя, отмечаем его как прочитанное
        if (message.sender_id !== userId.value) {
          // Отмечаем полученное сообщение как прочитанное
          markMessageAsRead(message.id);
          
          // Также отмечаем все свои предыдущие сообщения как прочитанные
          // (если пользователь ответил, значит прочитал наши сообщения)
          markOwnMessagesAsRead();
          
          // Сбрасываем счетчик непрочитанных сообщений для текущего чата
          chatStore.resetUnreadCount(chatId.value);
        }
      } else {
        console.log(`ChatView: Сообщение ${messageId} уже существует в чате, пропускаем`);
      }
    });
    
    // Подписываемся на изменения статуса соединения
    unsubscribeStatus.value = webSocketService.onStatusChange((status) => {
      console.log('WebSocket статус:', status);
      
      if (status.status === 'connected') {
        chatStatus.value = 'В сети';
      } else if (status.status === 'reconnecting') {
        chatStatus.value = `Переподключение (${status.attempt}/${status.maxAttempts})`;
      } else if (status.status === 'disconnected') {
        chatStatus.value = 'Не в сети';
      } else if (status.status === 'failed') {
        chatStatus.value = 'Ошибка соединения';
      }
    });
    
    // Подписываемся на ошибки WebSocket
    unsubscribeError.value = webSocketService.onError((error) => {
      console.error('WebSocket ошибка:', error);
      toast.error(`Ошибка соединения: ${error}`);
    });
  }
}

// Отправка сообщения через WebSocket
function sendMessage() {
  if (!newMessage.value.trim() || sendingMessage.value) return;
  
  sendingMessage.value = true;
  
  try {
    const messageText = newMessage.value.trim();
    
    // console.log('ChatView: Отправка сообщения в чат', chatId.value);
    
    // Отправляем сообщение через WebSocket
    const clientMessageId = webSocketService.sendMessage(messageText);
    
    // console.log('ChatView: Сообщение отправлено, client_message_id:', clientMessageId);
    
    // Очищаем поле ввода
    newMessage.value = '';
    
    // Фокусируемся на поле ввода
    messageInput.value?.focus();
    
    // Сообщение будет добавлено в чат автоматически при получении от сервера
    // Но сразу прокручиваем к последнему сообщению после отправки
    nextTick(() => {
      scrollToBottom();
    });
  } catch (error) {
    console.error('Ошибка при отправке сообщения:', error);
    toast.error('Не удалось отправить сообщение. Пожалуйста, попробуйте снова.');
  } finally {
    // Задержка для визуального отклика
    setTimeout(() => {
      sendingMessage.value = false;
    }, 300);
  }
}

// Получение имени чата
function getChatName(chat) {
  if (chat.name) {
    return chat.name;
  }
  
  // Для личных чатов отображаем имя собеседника
  if (chat.type === 'personal' && chat.members && chat.members.length > 0) {
    const otherMember = chat.members.find(member => member.id !== userId.value);
    
    if (otherMember) {
      return otherMember.name;
    }
  }
  
  return 'Чат';
}

// Получение инициалов чата для аватара
function getChatInitials(chat) {
  const name = getChatName(chat);
  
  return getInitials(name);
}

// Получение инициалов из имени
function getInitials(name) {
  if (name) {
    const words = name.split(' ');
    
    if (words.length >= 2) {
      return `${words[0][0]}${words[1][0]}`.toUpperCase();
    }
    
    return name[0].toUpperCase();
  }
  
  return '?';
}

// Прокрутка к последнему сообщению
function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    isAtBottom.value = true;
  }
}

// Проверка, находится ли скролл внизу
function isScrolledToBottom() {
  if (!messagesContainer.value) return false;
  
  const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value;
  return scrollHeight - scrollTop - clientHeight < 50;
}

// Форматирование времени сообщения
function formatTime(timestamp) {
  if (!timestamp) return '';
  
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  return date.toLocaleString([], {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Отключение WebSocket при размонтировании компонента
onUnmounted(() => {
  console.log('ChatView: отключаемся от WebSocket');
  if (unsubscribeMessage.value) unsubscribeMessage.value();
  if (unsubscribeStatus.value) unsubscribeStatus.value();
  if (unsubscribeError.value) unsubscribeError.value();
  webSocketService.disconnect();
  
  // Удаляем обработчик события загрузки
  window.removeEventListener('load', handleContentLoaded);
});

// Обработчик загрузки содержимого чата
function handleContentLoaded() {
  if (messagesContainer.value && messages.value.length > 0) {
    scrollToBottom();
  }
}

// Пометить сообщение как прочитанное
async function markMessageAsRead(messageId) {
  try {
    console.log(`Отмечаем сообщение ${messageId} как прочитанное`);
    await chatStore.markMessageAsRead(messageId, chatId.value);
  } catch (error) {
    console.error('Ошибка при отметке сообщения как прочитанного:', error);
  }
}

// Отметить все непрочитанные сообщения в чате как прочитанные
function markAllMessagesAsRead() {
  if (!messages.value || messages.value.length === 0) return;
  
  // Найти все непрочитанные сообщения от других пользователей
  const unreadMessages = messages.value.filter(
    msg => !msg.is_read && msg.sender_id !== userId.value
  );
  
  if (unreadMessages.length > 0) {
    console.log(`Отмечаем ${unreadMessages.length} непрочитанных сообщений как прочитанные`);
    
    // Отметить каждое сообщение как прочитанное
    unreadMessages.forEach(message => {
      markMessageAsRead(message.id);
    });
    
    // Если есть сообщения от других пользователей, 
    // значит пользователь уже видел ответы на свои сообщения,
    // поэтому отмечаем и свои сообщения как прочитанные
    markOwnMessagesAsRead();
  } else {
    // Проверяем, есть ли вообще сообщения от других пользователей
    const hasOtherUsersMessages = messages.value.some(msg => msg.sender_id !== userId.value);
    
    // Если есть сообщения от других пользователей, отмечаем свои как прочитанные
    if (hasOtherUsersMessages) {
      markOwnMessagesAsRead();
    }
  }
}

// Пометить все свои непрочитанные сообщения в чате как прочитанные
function markOwnMessagesAsRead() {
  if (!messages.value || messages.value.length === 0) return;
  
  // Находим все свои непрочитанные сообщения
  const unreadOwnMessages = messages.value.filter(
    msg => !msg.is_read && msg.sender_id === userId.value
  );
  
  if (unreadOwnMessages.length > 0) {
    console.log(`Отмечаем ${unreadOwnMessages.length} своих непрочитанных сообщений как прочитанные`);
    
    // Обновляем статус сообщений в интерфейсе без запроса к серверу
    unreadOwnMessages.forEach(message => {
      // Обновляем статус сообщения в хранилище
      chatStore.updateMessageStatus(message.id, chatId.value, true);
    });
  }
}
</script>

<style scoped>
.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-background);
  position: relative;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
}

.chat-header {
  display: flex;
  align-items: center;
  padding: var(--spacing-md);
  background-color: var(--color-surface);
  border-bottom: 1px solid var(--color-gray-800);
}

.chat-avatar {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  background-color: var(--color-primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 500;
  margin-right: var(--spacing-md);
}

.chat-header-info {
  flex: 1;
}

.chat-title {
  margin: 0;
  color: var(--color-text-primary);
}

.chat-status {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
}

.messages-loading,
.no-messages {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-secondary);
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.message-item {
  display: flex;
  align-items: flex-start;
  max-width: 70%;
}

.message-mine {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.message-avatar {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background-color: var(--color-surface-variant);
  color: var(--color-text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  font-weight: 500;
  margin-right: var(--spacing-sm);
}

.message-mine .message-avatar {
  margin-right: 0;
  margin-left: var(--spacing-sm);
}

.message-content {
  background-color: var(--color-surface);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm) var(--spacing-md);
  position: relative;
}

.message-mine .message-content {
  background-color: rgba(147, 112, 219, 0.2);
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-xs);
}

.message-sender {
  font-weight: 500;
  font-size: 0.85rem;
  color: var(--color-primary);
  margin-right: var(--spacing-sm);
}

.message-time {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.message-text {
  color: var(--color-text-primary);
  word-wrap: break-word;
  white-space: pre-wrap;
}

.message-status {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  text-align: right;
  margin-top: var(--spacing-xs);
}

.message-input-container {
  display: flex;
  padding: var(--spacing-md);
  background-color: var(--color-surface);
  border-top: 1px solid var(--color-gray-800);
}

.message-input {
  flex: 1;
  height: 3.75rem;
  padding: var(--spacing-sm) var(--spacing-md);
  background-color: var(--color-background);
  border: 1px solid var(--color-gray-700);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  resize: none;
  margin-right: var(--spacing-sm);
}

.message-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.send-button {
  background-color: var(--color-primary);
  color: white;
  height: 3.75rem;
  min-width: 7rem;
}

.load-more-container {
  display: flex;
  justify-content: center;
  margin-bottom: var(--spacing-md);
  padding-top: var(--spacing-sm);
}

.load-more-btn {
  font-size: 0.875rem;
  padding: 0.25rem 0.75rem;
}

.no-chat-selected {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--color-text-secondary);
  background-color: var(--color-background);
  text-align: center;
  padding: var(--spacing-lg);
}

@media (max-width: 768px) {
  .message-item {
    max-width: 85%;
  }
}
</style>
 