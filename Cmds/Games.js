const dreaded = global.dreaded;
const fs = require("fs");
const path = require("path");

dreaded({
  pattern: "gcapital",
  desc: "Gcapital command",
  category: "Games",
  filename: __filename
}, async (context) => {
  
  

  const countries = JSON.parse(fs.readFileSync(path.join(__dirname, "countries.json")));
  const sessions = {};

  const { client, m, groupSender, prefix } = context;
  const groupId = m.chat;
  const senderId = m.sender;
  const displayId = groupSender;
  const text = m.text.trim();
  const args = text.split(" ").slice(1);

  if (!sessions[groupId]) {
    sessions[groupId] = {
      players: {},
      started: false,
      finished: false,
      turn: null,
      timeoutRef: null,
      questionMessageId: null,
      eventListenerActive: false,
      _eventHandler: null
    };
  }

  const session = sessions[groupId];

  if (args.length === 0) {
    return await client.sendMessage(groupId, {
      text:
        `🎯 *Capital City Game*\n\n` +
        `2 players required. Turn-based quiz.\n\n` +
        `📘 *Usage:*\n` +
        `• ${prefix}gcapital join — join game\n` +
        `• ${prefix}gcapital leave — leave game\n` +
        `• ${prefix}gcapital players — view players\n` +
        `• ${prefix}gcapital scores — view scores\n` +
        `• Reply to question messages with just the capital city name!`
    }, { quoted: m });
  }

  const sub = args[0].toLowerCase();

  if (sub === "join") {
    if (session.players[senderId]) {
      return await client.sendMessage(groupId, {
        text: `🕹️ You've already joined.`
      }, { quoted: m });
    }

    if (Object.keys(session.players).length >= 2) {
      return await client.sendMessage(groupId, {
        text: `❌ 2 players already joined.`
      }, { quoted: m });
    }

    session.players[senderId] = {
      display: displayId,
      score: 0,
      asked: [],
      current: null,
      awaitingAnswer: false,
      questionIndex: 0
    };

    if (Object.keys(session.players).length === 1) {
      return await client.sendMessage(groupId, {
        text: `✅ You joined.\n⏳ Waiting for opponent...`
      }, { quoted: m });
    }

    session.started = true;
    const players = Object.keys(session.players);
    session.turn = players[Math.floor(Math.random() * 2)];
    const currentDisplay = session.players[session.turn].display;

    const introMessage = await client.sendMessage(groupId, {
      text: `✅ @${displayId.split("@")[0]} joined.\n\n🎮 Game starting!\n🔄 First turn: @${currentDisplay.split("@")[0]}\n\nReply to question messages with just the capital city name!`,
      mentions: [displayId, currentDisplay]
    }, { quoted: m });

    return await askQuestion(groupId, session.turn, { ...context, m: introMessage });
  }

  if (sub === "leave") {
    if (!session.players[senderId]) {
      return await client.sendMessage(groupId, {
        text: `🚫 You're not in this game.`
      }, { quoted: m });
    }

    const opponent = Object.keys(session.players).find(p => p !== senderId);
    clearTimeout(session.timeoutRef);
    session.eventListenerActive = false;

    if (session._eventHandler) {
      client.ev.off("messages.upsert", session._eventHandler);
    }

    delete sessions[groupId];

    if (opponent) {
      return await client.sendMessage(groupId, {
        text: `🚪 You left the game.\n🏆 @${session.players[opponent].display.split("@")[0]} wins by default!`,
        mentions: [session.players[opponent].display]
      }, { quoted: m });
    } else {
      return await client.sendMessage(groupId, {
        text: `🚪 You left the game.`
      }, { quoted: m });
    }
  }

  if (sub === "players") {
    const playerList = Object.values(session.players);
    if (playerList.length === 0) {
      return await client.sendMessage(groupId, {
        text: `No one has joined.`
      }, { quoted: m });
    }

    const textList = playerList.map(p => `- @${p.display.split("@")[0]}`).join("\n");
    return await client.sendMessage(groupId, {
      text: `👥 Players:\n${textList}`,
      mentions: playerList.map(p => p.display)
    }, { quoted: m });
  }

  if (sub === "scores") {
    if (!session.started) {
      return await client.sendMessage(groupId, {
        text: `Game hasn't started yet.`
      }, { quoted: m });
    }

    const scoresText = Object.values(session.players).map(
      p => `- @${p.display.split("@")[0]}: ${p.score}/10`
    ).join("\n");

    return await client.sendMessage(groupId, {
      text: `📊 Scores:\n${scoresText}`,
      mentions: Object.values(session.players).map(p => p.display)
    }, { quoted: m });
  }

  if (!session.started || session.finished) {
    return await client.sendMessage(groupId, {
      text: `❌ Please reply to the question message with just the capital city name!`
    }, { quoted: m });
  } // <-- Removed erroneous semicolon here

  async function askQuestion(groupId, playerId, context) {
    const { client, m } = context;
    const session = sessions[groupId];
    const player = session.players[playerId];

    let index;
    do {
      index = Math.floor(Math.random() * countries.length);
    } while (player.asked.includes(index));

    player.current = index;
    player.asked.push(index);
    player.awaitingAnswer = true;

    const country = countries[index].country;

    const questionMessage = await client.sendMessage(groupId, {
      text: `🌍 @${player.display.split("@")[0]}, what is the capital of *${country}*?\n📝 Reply to this message with your answer!`,
      mentions: [player.display]
    }, { quoted: m });

    session.questionMessageId = questionMessage.key.id;
    session.eventListenerActive = true;

    if (session._eventHandler) {
      client.ev.off("messages.upsert", session._eventHandler);
    }

    const eventHandler = async (update) => {
      if (!update || !update.messages || !Array.isArray(update.messages)) return;
      if (!session.eventListenerActive) return;

      const messageContent = update.messages[0];
      if (!messageContent.message) return;

      const message = messageContent.message;
      const chatId = messageContent.key.remoteJid;
      const responderId = messageContent.key.participant || messageContent.key.remoteJid;
      const contextInfo = message.extendedTextMessage?.contextInfo;
      const stanzaId = contextInfo?.stanzaId;

      const isReplyToQuestion = stanzaId === session.questionMessageId;

      if (isReplyToQuestion && chatId === groupId && responderId === playerId) {
        client.ev.off("messages.upsert", eventHandler);
        session.eventListenerActive = false;

        await client.sendMessage(chatId, {
          react: { text: '🤖', key: messageContent.key }
        });

        const userAnswer = (message.conversation || message.extendedTextMessage?.text || "").toLowerCase().trim();
        return await processAnswer(userAnswer, playerId, groupId, context);
      }
    };

    session._eventHandler = eventHandler;
    client.ev.on("messages.upsert", session._eventHandler);

    session.timeoutRef = setTimeout(async () => {
      if (!player.awaitingAnswer) return;

      client.ev.off("messages.upsert", session._eventHandler);
      session.eventListenerActive = false;

      player.awaitingAnswer = false;
      player.questionIndex++;

      await client.sendMessage(groupId, {
        text: `⏱️ Time's up for @${player.display.split("@")[0]}!`,
        mentions: [player.display]
      });

      const allDone = Object.values(session.players).every(p => p.questionIndex >= 15);
      if (allDone) {
        await endGame(client, groupId, session);
        return;
      }

      const next = Object.keys(session.players).find(p => p !== playerId);
      session.turn = next;
      return await askQuestion(groupId, next, context);
    }, 60000);
  }

  async function processAnswer(userAnswer, senderId, groupId, context) {
    const { client, m } = context;
    const session = sessions[groupId];
    const player = session.players[senderId];

    if (!player || !player.awaitingAnswer) return;

    clearTimeout(session.timeoutRef);
    session.eventListenerActive = false;

    const correct = countries[player.current].capital.toLowerCase();

    if (userAnswer === correct) {
      player.score++;
      await client.sendMessage(groupId, {
        text: `✅ Correct!`
      }, { quoted: m });
    } else {
      await client.sendMessage(groupId, {
        text: `❌ Incorrect. Correct answer: *${countries[player.current].capital}*`
      }, { quoted: m });
    }

    player.awaitingAnswer = false;
    player.questionIndex++;

    const allDone = Object.values(session.players).every(p => p.questionIndex >= 15);
    if (allDone) {
      await endGame(client, groupId, session);
      return;
    }

    const next = Object.keys(session.players).find(p => p !== senderId);
    session.turn = next;
    return await askQuestion(groupId, next, context);
  }

  async function endGame(client, groupId, session) {
    session.finished = true;
    const [p1, p2] = Object.keys(session.players);
    const s1 = session.players[p1].score;
    const s2 = session.players[p2].score;
    const d1 = session.players[p1].display;
    const d2 = session.players[p2].display;

    const winner = s1 === s2 ? "🤝 It's a tie!" :
                  s1 > s2 ? `🏆 Winner: @${d1.split("@")[0]}` :
                            `🏆 Winner: @${d2.split("@")[0]}`;

    await client.sendMessage(groupId, {
      text: `🏁 Game Over!\n\nScores:\n- @${d1.split("@")[0]}: ${s1}/15\n\n- @${d2.split("@")[0]}: ${s2}/15\n\n${winner} 🎉`,
      mentions: [d1, d2]
    });

    delete sessions[groupId];
  }
}); // <-- Closing for `dreaded()`



dreaded({
  pattern: "gword",
  desc: "Gword command",
  category: "Games",
  filename: __filename
}, async (context) => {
  
  

  const wordListPath = path.resolve(__dirname, "../node_modules/word-list/words.txt");
  const wordPool = fs.readFileSync(wordListPath, "utf-8")
      .split("\n")
      .map(w => w.trim().toLowerCase())
      .filter(w => w.length >= 3 && w.length <= 10 && /^[a-z]+$/.test(w)); 

  const sessions = {};

  function isValidWord(word, criteria) {
      if (!wordPool.includes(word)) return false;
      if (word.length !== criteria.length) return false;
      if (criteria.end && !word.endsWith(criteria.end)) return false;
      return true;
  }

  function pickWord(session) {
      const length = Math.floor(Math.random() * 8) + 3; 
      const end = Math.random() < 0.5 ? null : String.fromCharCode(97 + Math.floor(Math.random() * 26));

      let pool = wordPool.filter(w =>
          w.length === length &&
          (!end || w.endsWith(end)) &&
          !session.usedWords.has(w)
      );

      if (pool.length === 0) return pickWord(session); 
      const word = pool[Math.floor(Math.random() * pool.length)];
      session.usedWords.add(word); 

      const criteria = { length, end };
      return { word, clue: `🧠 Guess a ${length}-letter word${end ? ` ending with "${end}"` : ""}!`, criteria };
  }

  const { client, m, groupSender, prefix } = context;
  const groupId = m.chat;
  const senderId = m.sender;
  const displayId = groupSender;
  const text = m.text.trim();
  const args = text.split(" ").slice(1);

  if (!sessions[groupId]) {
      sessions[groupId] = {
          players: {},
          started: false,
          finished: false,
          currentWord: null,
          currentCriteria: null,
          round: 0,
          timeoutRef: null,
          questionMessageId: null,
          eventListenerActive: false,
          _eventHandler: null,
          usedWords: new Set()
      };
  }

  const session = sessions[groupId];

  if (args.length === 0) {
      return await client.sendMessage(groupId, {
          text:
              `🔤 *Word Guessing Game*\n\n` +
              `2 players required. First to answer wins the point.\n\n` +
              `📘 *Usage:*\n` +
              `• ${prefix}gword join — join game\n` +
              `• ${prefix}gword leave — leave game\n` +
              `• ${prefix}gword players — view players\n` +
              `• ${prefix}gword scores — view scores\n` +
              `• Reply to question messages with your guess!`
      }, { quoted: m });
  }

  const sub = args[0].toLowerCase();

  if (sub === "join") {
      if (session.players[senderId]) {
          return await client.sendMessage(groupId, {
              text: `🕹️ You've already joined.`
          }, { quoted: m });
      }

      if (Object.keys(session.players).length >= 2) {
          return await client.sendMessage(groupId, {
              text: `❌ 2 players already joined.`
          }, { quoted: m });
      }

      session.players[senderId] = {
          display: displayId,
          score: 0
      };

      if (Object.keys(session.players).length === 1) {
          return await client.sendMessage(groupId, {
              text: `✅ You joined.\n⏳ Waiting for opponent...`
          }, { quoted: m });
      }

      session.started = true;
      const players = Object.values(session.players);

      const introMessage = await client.sendMessage(groupId, {
          text: `✅ @${displayId.split("@")[0]} joined.\n\n🎮 Game starting!\n\n⚡ First to answer gets the point!\nReply to question messages with your guess!`,
          mentions: [displayId]
      }, { quoted: m });

      return await askQuestion(groupId, { ...context, m: introMessage });
  }

  if (sub === "leave") {
      if (!session.players[senderId]) {
          return await client.sendMessage(groupId, {
              text: `🚫 You're not in this game.`
          }, { quoted: m });
      }

      const opponent = Object.keys(session.players).find(p => p !== senderId);
      clearTimeout(session.timeoutRef);
      session.eventListenerActive = false;

      if (session._eventHandler) {
          client.ev.off("messages.upsert", session._eventHandler);
      }

      delete sessions[groupId];

      if (opponent) {
          return await client.sendMessage(groupId, {
              text: `🚪 You left the game.\n🏆 @${session.players[opponent].display.split("@")[0]} has won...`,
              mentions: [session.players[opponent].display]
          }, { quoted: m });
      } else {
          return await client.sendMessage(groupId, {
              text: `🚪 You left the game.`
          }, { quoted: m });
      }
  }

  if (sub === "players") {
      const playerList = Object.values(session.players);
      if (playerList.length === 0) {
          return await client.sendMessage(groupId, {
              text: `No one has joined.`
          }, { quoted: m });
      }

      const textList = playerList.map(p => `- @${p.display.split("@")[0]}`).join("\n");
      return await client.sendMessage(groupId, {
          text: `👥 Players:\n${textList}`,
          mentions: playerList.map(p => p.display)
      }, { quoted: m });
  }

  if (sub === "scores") {
      if (!session.started) {
          return await client.sendMessage(groupId, {
              text: `Game hasn't started yet.`
          }, { quoted: m });
      }

      const scoresText = Object.values(session.players).map(
          p => `- @${p.display.split("@")[0]}: ${p.score}/10`
      ).join("\n");

      return await client.sendMessage(groupId, {
          text: `📊 Scores:\n${scoresText}`,
          mentions: Object.values(session.players).map(p => p.display)
      }, { quoted: m });
  }

  if (!session.started || session.finished) {
      return await client.sendMessage(groupId, {
          text: `❌ Please reply to the question message with your guess!`
      }, { quoted: m });
  }

  async function askQuestion(groupId, context) {
      const { client, m } = context;
      const session = sessions[groupId];

      if (!session || session.finished) return;

      const { word, clue, criteria } = pickWord(session);
      session.currentWord = word;
      session.currentClue = clue;
      session.currentCriteria = criteria;
      session.round++;

      console.log(`[${groupId}] ❓ Round ${session.round}: "${clue}" — answer: "${word}"`);

      const questionMessage = await client.sendMessage(groupId, {
          text: `🔤 Round ${session.round}/20\n${clue}\n📝 Reply to this message with your guess!`,
          mentions: Object.values(session.players).map(p => p.display)
      }, { quoted: m });

      session.questionMessageId = questionMessage.key.id;
      session.eventListenerActive = true;

      if (session._eventHandler) {
          client.ev.off("messages.upsert", session._eventHandler);
      }

      const eventHandler = async (update) => {
          try {
              if (!update?.messages?.[0]) return;
              if (!session.eventListenerActive) return;

              const msg = update.messages[0];
              const chatId = msg.key.remoteJid;
              const responderId = msg.key.participant || msg.key.remoteJid;
              const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
              const stanzaId = contextInfo?.stanzaId;

              const isReplyToQuestion = stanzaId === session.questionMessageId;
              const isFromPlayer = session.players[responderId];

              if (!isReplyToQuestion || chatId !== groupId || !isFromPlayer) return;

              const userAnswer = (
                  msg.message?.conversation ||
                  msg.message?.extendedTextMessage?.text ||
                  ""
              ).toLowerCase().trim();

              console.log(`[${groupId}] 🧠 @${responderId.split("@")[0]} guessed: "${userAnswer}"`);

              await client.sendMessage(chatId, {
                  react: { text: '🤖', key: msg.key }
              });

              if (session.usedWords.has(userAnswer)) {
                  return await client.sendMessage(chatId, {
                      text: `⚠️ The word "${userAnswer}" has already been used. Try a new word!`,
                      mentions: [session.players[responderId].display]
                  }, { quoted: msg });
              }

              const isCorrect = isValidWord(userAnswer, session.currentCriteria);

              if (isCorrect) {
                  session.eventListenerActive = false;
                  clearTimeout(session.timeoutRef);
                  client.ev.off("messages.upsert", session._eventHandler);

                  session.players[responderId].score++;
                  session.usedWords.add(userAnswer); 

                  await client.sendMessage(chatId, {
                      text: `✅ @${session.players[responderId].display.split("@")[0]} got it! "${userAnswer}" is correct!`,
                      mentions: [session.players[responderId].display]
                  }, { quoted: msg });

                  if (session.round >= 20) {
                      return await endGame(client, groupId, session);
                  }

                  return await askQuestion(groupId, { ...context, m: msg });
              } else {
                  session.usedWords.add(userAnswer); 

                  await client.sendMessage(chatId, {
                      text: `❌ "${userAnswer}" is incorrect. Try again.`,
                      mentions: [session.players[responderId].display]
                  }, { quoted: msg });
              }
          } catch (err) {
              console.error(`[${groupId}] ❌ Error in message listener:`, err);
          }
      };

      session._eventHandler = eventHandler;
      client.ev.on("messages.upsert", eventHandler);

      session.timeoutRef = setTimeout(async () => {
          if (!session.eventListenerActive) return;

          session.eventListenerActive = false;
          client.ev.off("messages.upsert", session._eventHandler);

          console.log(`[${groupId}] ⏱️ Time's up. Correct word: ${session.currentWord}`);

          await client.sendMessage(groupId, {
              text: `⏱️ Time's up! An example answer was *${session.currentWord}*.`
          });

          if (session.round >= 20) {
              await endGame(client, groupId, session);
          } else {
              await askQuestion(groupId, context);
          }
      }, 40000);
  }

  async function endGame(client, groupId, session) {
      session.finished = true;
      const players = Object.values(session.players);
      const [p1, p2] = players;
      const s1 = p1.score;
      const s2 = p2.score;
      const d1 = p1.display;
      const d2 = p2.display;

      const winner = s1 === s2 ? "🤝 It's a tie!" :
                     s1 > s2 ? `🏆 Winner: @${d1.split("@")[0]}` :
                               `🏆 Winner: @${d2.split("@")[0]}`;

      await client.sendMessage(groupId, {
          text: `🏁 Game Over!\n\nScores:\n- @${d1.split("@")[0]}: ${s1}/20\n\n- @${d2.split("@")[0]}: ${s2}/20\n\n${winner} 🎉`,
          mentions: [d1, d2]
      });

      delete sessions[groupId];
  }
}); // <-- Closing for `dreaded()`
