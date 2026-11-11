import { Fragment, useState, useEffect, useRef } from "react";
import "./App.css";
import { filterChats } from "./chatSearch";
import { messageDay, messageDateLabel } from "./messageDate";
import { historyKey, readHistory, writeHistory, demoHistoryKey, readDemoMode, writeDemoMode } from "./chatStorage";
import { sendMessageRequest, SendTimeoutError } from "./api/sendMessage";

function App() {
  const [initialDemo] = useState(() => readDemoMode() ? readHistory(demoHistoryKey) : null);
  const [storageKey, setStorageKey] = useState("");
  const [isDemo, setIsDemo] = useState(() => readDemoMode());
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [chatName, setChatName] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [text, setText] = useState("");
  const [messages, setMessages] = useState(initialDemo?.messages || []);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  const [idInstance, setIdInstance] = useState("");
  const [apiTokenInstance, setApiTokenInstance] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("");

  const [chats, setChats] = useState(initialDemo?.chats || []);
  const [activeChatId, setActiveChatId] = useState(initialDemo?.activeChatId || "");
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

  const filteredChats = filterChats(chats, chatSearch);

  const activeChat = chats.find(function (chat) {
    return chat.id === activeChatId;
  });

  const visibleMessages = messages.filter(function (message) {
    return message.chatId === activeChatId;
  });

  function switchMode(demo) {
    const savedDemo = demo ? readHistory(demoHistoryKey) : null;
    setStorageKey("");
    setIsDemo(demo);
    setMobileChatOpen(false);
    setIsRenaming(false);
    setChatSearch("");
    setError("");
    setText("");
    setPhone("");
    setConnectionStatus("");
    setChats(demo ? (savedDemo?.chats || [
      { id: "demo-anna", name: "Анна · демо", phone: "Анна" },
      { id: "demo-team", name: "Команда · демо", phone: "Команда" }
    ]) : []);
    setActiveChatId(demo ? (savedDemo?.activeChatId || "demo-anna") : "");
    setMessages(demo ? (savedDemo?.messages || [
      { id: "welcome", chatId: "demo-anna", sender: "Анна", direction: "incoming",
        text: "Привет! Это демонстрационный чат. Напиши что-нибудь — получишь пример ответа 🙂" },
      { id: "team-welcome", chatId: "demo-team", sender: "Команда", direction: "incoming",
        text: "Здесь можно попробовать переключение между чатами. Переписка каждого чата отдельная." }
    ]) : []);
  }

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
    setStorageKey("");
    setValue(value);
    setChatSearch("");
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

      return [...previousMessages, { ...newMessage,
        read: newMessage.direction !== "incoming" || (newMessage.chatId === activeChatId && document.visibilityState === "visible" &&
          (!window.matchMedia("(max-width: 700px)").matches || mobileChatOpen)),
        timestamp: newMessage.timestamp || Date.now() }];
    });
  }

  function openChat(id) {
    setActiveChatId(id);
    setMobileChatOpen(true);
    setIsRenaming(false);
    setMessages(previous => previous.map(message => message.chatId === id ? { ...message, read: true } : message));
    setText("");
    setError("");
  }

  function renameChat(event) {
    event.preventDefault();
    const name = chatName.trim();
    setChats(previous => previous.map(chat => chat.id === activeChatId ? { ...chat, name } : chat));
    setIsRenaming(false);
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
      if (data.stateInstance === "authorized") {
        const key = await historyKey(idInstance);
        const saved = readHistory(key);
        if (saved) {
          setChats(saved.chats);
          setMessages(saved.messages);
          setActiveChatId(saved.activeChatId);
        }
        setStorageKey(key);
      }
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
      openChat(existingChat.id);
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

      openChat(newChat.id);
      setText("");
    } catch {
      setError("Не удалось создать чат");
    } finally {
      setIsCreatingChat(false);
    }
  }

  async function sendMessage() {
    if (!isDemo && !hasCredentials()) {
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

    if (isDemo) {
      const id = crypto.randomUUID();
      addMessage({ id, text: cleanText, sender: "Я", chatId: targetChatId, direction: "outgoing", status: "demo" });
      addMessage({ id: `${id}-reply`, text: "Сообщение принято 🙂 Это автоматический демоответ. Настоящие сообщения можно отправлять после подключения GREEN-API.",
        sender: activeChat.phone, chatId: targetChatId, direction: "incoming" });
      setText("");
      return;
    }

    const pendingId = crypto.randomUUID();
    addMessage({ id: pendingId, text: cleanText, sender: "Я", chatId: targetChatId,
      direction: "outgoing", status: "sending" });
    setText("");
    setIsSending(true);

    try {
      const data = await sendMessageRequest(createUrl("sendMessage"), {
        chatId: targetChatId,
        message: cleanText
      });

      setMessages(previous => previous.map(message => message.id === pendingId
        ? { ...message, apiId: String(data.idMessage), status: "accepted" } : message));
    } catch (error) {
      setMessages(previous => previous.map(message => message.id === pendingId
        ? { ...message, status: "unconfirmed" } : message));
      setError(error instanceof SendTimeoutError
        ? "GREEN-API не подтвердил отправку за 20 секунд. Сообщение могло дойти — проверьте чат получателя перед повторной отправкой."
        : error.message || "Не удалось подтвердить отправку. Проверьте чат получателя перед повторной отправкой.");
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
          timestamp: Number.isFinite(body.timestamp) && body.timestamp > 0 ? body.timestamp * 1000 : Date.now(),
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
    writeDemoMode(isDemo);
    if (isDemo || storageKey) {
      writeHistory(isDemo ? demoHistoryKey : storageKey, chats, messages, activeChatId);
    }
  }, [storageKey, isDemo, chats, messages, activeChatId]);

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
      <section className="mode-panel" aria-label="Режим мессенджера">
        <div>
          <strong>{isDemo ? "Демонстрационный режим" : "MAX-мессенджер"}</strong>
          <p className="hint">{isDemo
            ? "Вымышленные чаты и автоматические ответы. Сообщения никуда не отправляются."
            : "Попробуйте чат без регистрации или подключите свой аккаунт GREEN-API."}</p>
        </div>
        <button disabled={credentialsDisabled} onClick={() => switchMode(!isDemo)}>
          {isDemo ? "Подключить GREEN-API" : "Попробовать демо"}
        </button>
      </section>
      {!isDemo && <section className="connection-panel">
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
      </section>}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className={`chat-layout${mobileChatOpen ? " mobile-chat-open" : ""}`}>
        <aside className="sidebar">
          <h1>Мой чат</h1>
          {!isDemo && <p className="hint">Переписка сохраняется в этом браузере после подключения. После обновления подключитесь снова, чтобы её восстановить. Токен не сохраняется.</p>}


          {!isDemo && <div className="new-chat">
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
          </div>}

          <div className="chat-search">
            <input type="search" aria-label="Поиск по чатам" placeholder="Номер или имя"
              value={chatSearch} onChange={event => setChatSearch(event.target.value)} />
            {chatSearch && <button type="button" aria-label="Очистить поиск по чатам"
              onClick={() => setChatSearch("")}>×</button>}
          </div>
          <nav className="chat-list" aria-label="Список чатов">
            {chats.length === 0 && (
              <p className="hint">Создайте чат по номеру телефона.</p>
            )}

            {chats.length > 0 && filteredChats.length === 0 && (
              <p className="hint" role="status">Чаты не найдены. Попробуйте другой номер или имя.</p>
            )}
            {filteredChats.map(function (chat) {
              const last = messages.filter(message => message.chatId === chat.id).at(-1);
              const unread = messages.filter(message => message.chatId === chat.id && message.direction === "incoming" && message.read === false).length;
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
                    openChat(chat.id);
                  }}
                >
                  <span className="avatar">
                    {chat.phone.slice(-2)}
                  </span>
                  <span className="chat-summary">
                    <strong>{chat.name || chat.phone}</strong>
                    <span className="chat-preview">{last ? `${last.direction === "outgoing" ? "Вы: " : ""}${last.text}` : "Пока нет сообщений"}</span>
                  </span>
                  {unread > 0 && <span className="unread-count" aria-label={`Непрочитанных: ${unread}`}>{unread}</span>}
                </button>
              );
            })}
          </nav>

          {!isDemo && <div className="receiving-controls">
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
          </div>}
        </aside>

        <section className="conversation">
          <header className="conversation-header">
            <button className="mobile-back" type="button" onClick={() => { setMobileChatOpen(false); setIsRenaming(false); }}>← Чаты</button>
            <strong>
              {activeChat ? (activeChat.name || activeChat.phone) : "Выберите чат"}
            </strong>
            {activeChat && <button type="button" onClick={() => {
              setChatName(activeChat.name || ""); setIsRenaming(true);
            }}>Изменить имя</button>}
            {isRenaming && <form className="rename-chat" onSubmit={renameChat}>
              <input aria-label="Имя чата" value={chatName} maxLength={60}
                onChange={event => setChatName(event.target.value)} placeholder="Имя (пустое — номер телефона)" autoFocus />
              <button type="submit">Сохранить</button>
              <button type="button" onClick={() => setIsRenaming(false)}>Отмена</button>
            </form>}
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

            {visibleMessages.map(function (message, index) {
              const day = messageDay(message.timestamp);
              const previousDay = messageDay(visibleMessages[index - 1]?.timestamp);
              return (
                <Fragment key={`${message.chatId}:${message.id}`}>
                  {day && day !== previousDay && (
                    <div className="message-date">{messageDateLabel(message.timestamp)}</div>
                  )}
                <article
                  className={`message ${message.direction}`}
                >
                  <span className="message-sender">
                    {message.sender}
                  </span>
                  <p>{message.text}</p>
                  {message.direction === "outgoing" && message.status && <span className={`message-status ${message.status}`}>
                    {{ sending: "Отправляется…", accepted: "Принято API", unconfirmed: "Нет подтверждения — проверьте у получателя", demo: "Демо" }[message.status]}
                  </span>}
                  {Number.isFinite(message.timestamp) && message.timestamp > 0 && (
                    <time className="message-time" dateTime={new Date(message.timestamp).toISOString()}
                      title={new Date(message.timestamp).toLocaleString("ru-RU")}>
                      {new Date(message.timestamp).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                    </time>
                  )}
                </article>
                </Fragment>
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