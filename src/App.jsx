import { useState, useEffect, useRef } from "react";
import "./App.css";

function App() {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState([]);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  const [idInstance, setIdInstance] = useState("");
  const [apiTokenInstance, setApiTokenInstance] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("");

  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState("");
  const [isCreatingChat, setIsCreatingChat] = useState(false);

  const [isReceiving, setIsReceiving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [autoReceive, setAutoReceive] = useState(false);

  const receiveFunctionRef = useRef(null);
  const receiveBusyRef = useRef(false);
  const messagesEndRef = useRef(null);

  const apiUrl = "https://3100.api.green-api.com";

  const credentialsDisabled =
    isCreatingChat || autoReceive || isChecking || isSending || isReceiving;

  const activeChat = chats.find(function (chat) {
    return chat.id === activeChatId;
  });

  const visibleMessages = messages.filter(function (message) {
    return message.chatId === activeChatId;
  });

  function createUrl(method) {
    return `${apiUrl}/waInstance${idInstance.trim()}/${method}/${apiTokenInstance.trim()}`;
  }

  function hasCredentials() {
    if (idInstance.trim() === "" || apiTokenInstance.trim() === "") {
      setError("Введите ID инстанса и API токен");
      return false;
    }

    if (!/^\d+$/.test(idInstance.trim())) {
      setError("ID инстанса должен содержать только цифры");
      return false;
    }

    return true;
  }

  function changeCredentials(setValue, value) {
    setValue(value);
    setConnectionStatus("");
    setChats([]);
    setMessages([]);
    setActiveChatId("");
    setText("");
    setError("");
  }

  function addMessage(newMessage) {
    setMessages(function (previousMessages) {
      const alreadyExists = previousMessages.some(function (message) {
        return (
          message.id === newMessage.id &&
          message.chatId === newMessage.chatId
        );
      });

      if (alreadyExists) {
        return previousMessages;
      }

      return [...previousMessages, newMessage];
    });
  }

  async function checkConnection() {
    if (!hasCredentials()) {
      return;
    }

    setError("");
    setConnectionStatus("Проверяем…");
    setIsChecking(true);

    try {
      const response = await fetch(createUrl("getStateInstance"));

      if (!response.ok) {
        setError(`Ошибка проверки: ${response.status}`);
        setConnectionStatus("");
        return;
      }

      const data = await response.json();
      setConnectionStatus(data.stateInstance);
    } catch {
      setError("Не удалось связаться с GREEN-API");
      setConnectionStatus("");
    } finally {
      setIsChecking(false);
    }
  }

  async function createChat() {
    if (!hasCredentials()) {
      return;
    }

    const cleanPhone = phone.trim();

    if (!/^(7\d{10}|375\d{9})$/.test(cleanPhone)) {
      setError("Введите номер: 7 и ещё 10 цифр или 375 и ещё 9 цифр");
      return;
    }

    setError("");

    const existingChat = chats.find(function (chat) {
      return chat.phone === cleanPhone;
    });

    if (existingChat) {
      setActiveChatId(existingChat.id);
      setText("");
      return;
    }

    setIsCreatingChat(true);

    try {
      const response = await fetch(createUrl("checkAccount"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          phoneNumber: Number(cleanPhone)
        })
      });

      if (!response.ok) {
        setError(`Ошибка создания чата: ${response.status}`);
        return;
      }

      const data = await response.json();

      if (!data.exist || !data.chatId) {
        setError(
          data.reason || "Не удалось найти доступный аккаунт MAX по номеру"
        );
        return;
      }

      const newChat = {
        id: String(data.chatId),
        phone: cleanPhone
      };

      setChats(function (previousChats) {
        const alreadyExists = previousChats.some(function (chat) {
          return chat.id === newChat.id;
        });

        if (alreadyExists) {
          return previousChats;
        }

        return [...previousChats, newChat];
      });

      setActiveChatId(newChat.id);
      setText("");
    } catch {
      setError("Не удалось создать чат");
    } finally {
      setIsCreatingChat(false);
    }
  }

  async function sendMessage() {
    if (!hasCredentials()) {
      return;
    }

    if (activeChatId === "") {
      setError("Создайте или выберите чат");
      return;
    }

    const cleanText = text.trim();

    setError("");

    if (cleanText === "") {
      setText("");
      return;
    }

    if (cleanText.length > 4000) {
      setError("Сообщение должно быть не длиннее 4000 символов");
      return;
    }

    const targetChatId = activeChatId;

    setIsSending(true);

    try {
      const response = await fetch(createUrl("sendMessage"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chatId: targetChatId,
          message: cleanText
        })
      });

      if (!response.ok) {
        setError(`Ошибка отправки: ${response.status}`);
        return;
      }

      const data = await response.json();

      if (!data.idMessage) {
        setError("GREEN-API не вернул ID сообщения");
        return;
      }

      addMessage({
        id: String(data.idMessage),
        text: cleanText,
        sender: "Я",
        chatId: targetChatId,
        direction: "outgoing"
      });

      setText("");
    } catch {
      setError("Не удалось отправить сообщение");
    } finally {
      setIsSending(false);
    }
  }

  async function receiveMessage() {
    if (receiveBusyRef.current) {
      return;
    }

    if (!hasCredentials()) {
      return;
    }

    receiveBusyRef.current = true;
    setIsReceiving(true);

    try {
      const response = await fetch(createUrl("receiveNotification"));

      if (!response.ok) {
        setError(`Ошибка получения: ${response.status}`);
        setAutoReceive(false);
        return;
      }

      const notification = await response.json();

      if (notification === null) {
        return;
      }

      const body = notification.body;

      if (
        body.typeWebhook === "incomingMessageReceived" &&
        body.messageData?.typeMessage === "textMessage"
      ) {
        addMessage({
          id: String(body.idMessage),
          text: body.messageData.textMessageData.textMessage,
          sender: body.senderData.senderName || "Собеседник",
          chatId: String(body.senderData.chatId),
          direction: "incoming"
        });
      }

      const deleteUrl =
        `${createUrl("deleteNotification")}/${notification.receiptId}`;

      const deleteResponse = await fetch(deleteUrl, {
        method: "DELETE"
      });

      if (!deleteResponse.ok) {
        setError("Не удалось подтвердить обработку уведомления");
        setAutoReceive(false);
        return;
      }

      const deleteResult = await deleteResponse.json();

      if (!deleteResult.result) {
        setError("GREEN-API не подтвердил обработку уведомления");
        setAutoReceive(false);
      }
    } catch {
      setError("Не удалось получить или обработать уведомление");
      setAutoReceive(false);
    } finally {
      receiveBusyRef.current = false;
      setIsReceiving(false);
    }
  }

  function toggleAutoReceive() {
    if (autoReceive) {
      setAutoReceive(false);
      return;
    }

    if (!hasCredentials()) {
      return;
    }

    setError("");
    setAutoReceive(true);
  }

  useEffect(function () {
    receiveFunctionRef.current = receiveMessage;
  });

  useEffect(function () {
    if (!autoReceive) {
      return;
    }

    let stopped = false;
    let timerId;

    async function poll() {
      if (stopped) {
        return;
      }

      await receiveFunctionRef.current();

      if (!stopped) {
        timerId = setTimeout(poll, 1000);
      }
    }

    timerId = setTimeout(poll, 0);

    return function () {
      stopped = true;
      clearTimeout(timerId);
    };
  }, [autoReceive]);

  useEffect(function () {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest"
    });
  }, [messages, activeChatId]);

  return (
    <main className="app">
      <section className="connection-panel">
        <strong>Подключение GREEN-API</strong>

        <input
          aria-label="ID инстанса"
          autoComplete="off"
          placeholder="ID инстанса"
          value={idInstance}
          disabled={credentialsDisabled}
          onChange={function (event) {
            changeCredentials(setIdInstance, event.target.value);
          }}
        />

        <input
          aria-label="API токен"
          type="password"
          autoComplete="off"
          placeholder="API токен"
          value={apiTokenInstance}
          disabled={credentialsDisabled}
          onChange={function (event) {
            changeCredentials(setApiTokenInstance, event.target.value);
          }}
        />

        <button
          onClick={checkConnection}
          disabled={credentialsDisabled}
        >
          {isChecking ? "Проверяем…" : "Подключиться"}
        </button>

        <span className="connection-status">
          {connectionStatus === "authorized"
            ? "Подключено"
            : connectionStatus || "Подключение не проверено"}
        </span>
      </section>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="chat-layout">
        <aside className="sidebar">
          <h1>Мой чат</h1>

          <div className="new-chat">
            <input
              aria-label="Номер получателя"
              placeholder="Номер с кодом страны"
              value={phone}
              disabled={isCreatingChat || isSending}
              onChange={function (event) {
                setPhone(event.target.value);
              }}
            />

            <button
              onClick={createChat}
              disabled={isCreatingChat || isSending || isChecking}
            >
              {isCreatingChat ? "Создаём…" : "Создать чат"}
            </button>
          </div>

          <nav className="chat-list" aria-label="Список чатов">
            {chats.length === 0 && (
              <p className="hint">Создайте чат по номеру телефона.</p>
            )}

            {chats.map(function (chat) {
              return (
                <button
                  className={
                    chat.id === activeChatId
                      ? "chat-item active"
                      : "chat-item"
                  }
                  aria-pressed={chat.id === activeChatId}
                  key={chat.id}
                  disabled={isSending || isCreatingChat}
                  onClick={function () {
                    setActiveChatId(chat.id);
                    setText("");
                    setError("");
                  }}
                >
                  <span className="avatar">
                    {chat.phone.slice(-2)}
                  </span>
                  <span>{chat.phone}</span>
                </button>
              );
            })}
          </nav>

          <div className="receiving-controls">
            <button
              onClick={toggleAutoReceive}
              disabled={!autoReceive && (isReceiving || isChecking)}
            >
              {autoReceive
                ? "Остановить получение"
                : "Включить получение"}
            </button>

            <button
              onClick={receiveMessage}
              disabled={autoReceive || isReceiving || isChecking}
            >
              {isReceiving ? "Получаем…" : "Получить ответ"}
            </button>

            <p className="hint">
              {autoReceive
                ? "Автоматическое получение включено"
                : "Автоматическое получение выключено"}
            </p>
          </div>
        </aside>

        <section className="conversation">
          <header className="conversation-header">
            <strong>
              {activeChat ? activeChat.phone : "Выберите чат"}
            </strong>
          </header>

          <div className="messages">
            {!activeChat && (
              <p className="empty-state">
                Создайте или выберите чат слева.
              </p>
            )}

            {activeChat && visibleMessages.length === 0 && (
              <p className="empty-state">
                Напишите первое сообщение.
              </p>
            )}

            {visibleMessages.map(function (message) {
              return (
                <article
                  className={`message ${message.direction}`}
                  key={`${message.chatId}:${message.id}`}
                >
                  <span className="message-sender">
                    {message.sender}
                  </span>
                  <p>{message.text}</p>
                </article>
              );
            })}

            <div ref={messagesEndRef} />
          </div>

          <form
            className="composer"
            onSubmit={function (event) {
              event.preventDefault();

              if (!isSending && !isChecking && !isCreatingChat) {
                sendMessage();
              }
            }}
          >
            <input
              aria-label="Текст сообщения"
              placeholder="Напишите сообщение…"
              value={text}
              disabled={isSending || activeChatId === ""}
              onChange={function (event) {
                setText(event.target.value);
              }}
            />

            <button
              type="submit"
              disabled={
                isSending ||
                isChecking ||
                isCreatingChat ||
                activeChatId === "" ||
                text.trim() === ""
              }
            >
              {isSending ? "Отправляем…" : "Отправить"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

export default App;