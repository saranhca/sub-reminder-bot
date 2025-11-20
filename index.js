require("dotenv").config();
const { Bot } = require("grammy");
const fs = require("fs");
const path = require("path");
const http = require("http"); // <-- добавили

// Создаём объект бота
const bot = new Bot(process.env.BOT_TOKEN);
const DATA_FILE = path.join(__dirname, "reminders.json");
const state = Object.create(null);

// -------- вспомогательные функции --------
function loadReminders() {
  try {
    const data = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

function saveReminders(reminders) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(reminders, null, 2), "utf-8");
}

function generateId() {
  return Date.now().toString() + Math.floor(Math.random() * 1000000).toString();
}

function isValidDateString(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const date = new Date(str + "T00:00:00");
  return !isNaN(date.getTime());
}

// -------- команды бота --------
bot.command("start", async (ctx) => {
  await ctx.reply(
    "Привет! Я бот-напоминалка по подпискам.\n\n" +
      "Команды:\n" +
      "/add - добавить напоминание\n" +
      "/list - показать все твои напоминания\n\n" +
      "Добавь подписку, и я напомню за 5 дней до окончания."
  );
});

bot.command("add", async (ctx) => {
  const chatId = ctx.chat.id;
  state[chatId] = { step: "waitingName" };
  await ctx.reply("Введи название подписки (например: Яндекс Плюс):");
});

bot.command("list", async (ctx) => {
  const chatId = ctx.chat.id;
  const reminders = loadReminders().filter((r) => r.chatId === chatId);

  if (reminders.length === 0) {
    await ctx.reply("У тебя пока нет сохранённых напоминаний.");
    return;
  }

  let text = "Твои подписки:\n\n";
  for (const r of reminders) {
    text +=
      "• " +
      r.name +
      "\n  Окончание: " +
      r.endDate +
      "\n  Напомнить за 5 дней: " +
      r.remindAt +
      "\n\n";
  }

  await ctx.reply(text);
});

bot.on("message:text", async (ctx) => {
  const chatId = ctx.chat.id;
  const msg = ctx.message.text.trim();

  if (msg.startsWith("/")) return;

  const userState = state[chatId];
  if (!userState) return;

  if (userState.step === "waitingName") {
    userState.tempName = msg;
    userState.step = "waitingDate";
    await ctx.reply(
      "Отлично! Теперь введи дату окончания подписки в формате ГГГГ-ММ-ДД.\n\n" +
        "Например: 2025-12-10"
    );
    return;
  }

  if (userState.step === "waitingDate") {
    const dateStr = msg;

    if (!isValidDateString(dateStr)) {
      await ctx.reply(
        "Дата некорректна. Введи, пожалуйста, в формате ГГГГ-ММ-ДД (например: 2025-12-10)."
      );
      return;
    }

    const endDate = new Date(dateStr + "T09:00:00");
    const remindAt = new Date(endDate.getTime() - 5 * 24 * 60 * 60 * 1000);

    const reminders = loadReminders();
    const newReminder = {
      id: generateId(),
      chatId: chatId,
      name: userState.tempName,
      endDate: dateStr,
      remindAt: remindAt.toISOString(),
      notified: false,
    };

    reminders.push(newReminder);
    saveReminders(reminders);
    delete state[chatId];

    await ctx.reply(
      'Супер! Я сохраню подписку "' +
        newReminder.name +
        '".\nОкончание: ' +
        newReminder.endDate +
        "\nНапомню за 5 дней до этой даты."
    );
  }
});

// -------- фоновая проверка напоминаний --------
async function checkReminders() {
  const reminders = loadReminders();
  const now = new Date();
  let changed = false;

  for (const r of reminders) {
    if (r.notified) continue;

    const remindAt = new Date(r.remindAt);
    if (!isNaN(remindAt.getTime()) && now >= remindAt) {
      try {
        await bot.api.sendMessage(
          r.chatId,
          'Напоминание!\nЧерез 5 дней заканчивается подписка "' +
            r.name +
            '".\nДата окончания: ' +
            r.endDate
        );
        r.notified = true;
        changed = true;
      } catch (err) {
        console.error("Ошибка отправки напоминания:", err);
      }
    }
  }

  if (changed) saveReminders(reminders);
}

setInterval(checkReminders, 60 * 1000);

// -------- HTTP-сервер для Render (Web Service Free) --------

// Render ждёт, что приложение будет слушать порт.
// PORT он передаёт через переменную окружения process.env.PORT.
// Если её нет (локальный запуск), используем 3000.
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  // Простейший ответ, чтобы Render видел "живой" сервис.
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Bot is running.\n");
});

server.listen(PORT, () => {
  console.log("HTTP-сервер запущен на порту", PORT);
});

// -------- запуск бота --------
bot.start();
console.log("Бот запущен.");
