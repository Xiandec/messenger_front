<template>
  <div class="welcome-container">
    <div class="welcome-content">
      <h1>Добро пожаловать в мессенджер</h1>
      <p>Выберите чат из списка слева или создайте новый</p>
    </div>
  </div>
</template>

<style scoped>
.welcome-container {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background-color: var(--color-background);
  flex: 1;
}

.welcome-content {
  text-align: center;
  padding: var(--spacing-lg);
  color: var(--color-text-secondary);
}

.welcome-content h1 {
  color: var(--color-primary);
  margin-bottom: var(--spacing-md);
  font-size: 1.75rem;
}
</style> 