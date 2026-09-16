using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using Newtonsoft.Json;

public class CPHInline
{
    private const string LastActivityKey = "spark.lastActivityUnix";
    private const string RecentMessagesKey = "spark.recentMessagesJson";
    private const string BotUserNameGlobal = "ai_bot_username";
    private const string DefaultBotUserName = "Fix0rAI";

    private const int ContextLimit = 30;
    private const int MaxMessageLength = 500;

    public bool Execute()
    {
        string message = null;

        if (!CPH.TryGetArg("message", out message) ||
            string.IsNullOrWhiteSpace(message))
        {
            CPH.TryGetArg("rawInput", out message);
        }

        // Пустые сообщения не считаем активностью.
        if (string.IsNullOrWhiteSpace(message))
        {
            return true;
        }

        // ВАЖНО: проверка выполняется до обновления LastActivityKey.
        // Поэтому приветствия и другие сообщения Fix0rAI не сбрасывают
        // таймер тишины Spark Bot и не попадают в его контекст.
        if (IsOwnBotMessage())
        {
            CPH.LogInfo(
                "Spark Bot: собственное сообщение Fix0rAI проигнорировано."
            );

            return true;
        }

        message = Regex.Replace(message, @"\s+", " ").Trim();

        if (message.Length > MaxMessageLength)
        {
            message = message.Substring(0, MaxMessageLength);
        }

        // Только сообщение другого зрителя считается активностью.
        long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        CPH.SetGlobalVar(LastActivityKey, now, false);

        List<string> messages = LoadList(RecentMessagesKey);
        messages.Add(message);

        if (messages.Count > ContextLimit)
        {
            messages.RemoveRange(
                0,
                messages.Count - ContextLimit
            );
        }

        CPH.SetGlobalVar(
            RecentMessagesKey,
            JsonConvert.SerializeObject(messages),
            false
        );

        return true;
    }

    private bool IsOwnBotMessage()
    {
        string userId = null;
        string userName = null;

        CPH.TryGetArg("userId", out userId);
        CPH.TryGetArg("userName", out userName);

        if (string.IsNullOrWhiteSpace(userName))
        {
            CPH.TryGetArg("user", out userName);
        }

        // Основная проверка — по Twitch User ID.
        // Смена регистра или отображаемого имени на неё не влияет.
        if (!string.IsNullOrWhiteSpace(userId))
        {
            try
            {
                var bot = CPH.TwitchGetBot();

                if (bot != null &&
                    !string.IsNullOrWhiteSpace(bot.UserId) &&
                    string.Equals(
                        bot.UserId,
                        userId,
                        StringComparison.Ordinal
                    ))
                {
                    return true;
                }
            }
            catch (Exception ex)
            {
                CPH.LogWarn(
                    "Spark Bot: не удалось получить Twitch ID бота: " +
                    ex.Message
                );
            }
        }

        // Запасная проверка — по нику. Она работает, даже если
        // TwitchGetBot() временно не вернул данные бот-аккаунта.
        if (string.IsNullOrWhiteSpace(userName))
        {
            return false;
        }

        string normalizedUserName = NormalizeUserName(userName);
        string configuredBotUserName =
            CPH.GetGlobalVar<string>(BotUserNameGlobal, true);

        if (string.IsNullOrWhiteSpace(configuredBotUserName))
        {
            configuredBotUserName =
                CPH.GetGlobalVar<string>(BotUserNameGlobal, false);
        }

        if (!string.IsNullOrWhiteSpace(configuredBotUserName) &&
            string.Equals(
                normalizedUserName,
                NormalizeUserName(configuredBotUserName),
                StringComparison.OrdinalIgnoreCase
            ))
        {
            return true;
        }

        // Fix0rAI игнорируется всегда, даже если глобальная переменная
        // ai_bot_username отсутствует или заполнена неверно.
        return string.Equals(
            normalizedUserName,
            DefaultBotUserName,
            StringComparison.OrdinalIgnoreCase
        );
    }

    private string NormalizeUserName(string userName)
    {
        if (string.IsNullOrWhiteSpace(userName))
        {
            return string.Empty;
        }

        return userName.Trim().TrimStart('@');
    }

    private List<string> LoadList(string key)
    {
        string json = CPH.GetGlobalVar<string>(key, false);

        if (string.IsNullOrWhiteSpace(json))
        {
            return new List<string>();
        }

        try
        {
            return JsonConvert.DeserializeObject<List<string>>(json)
                ?? new List<string>();
        }
        catch (Exception ex)
        {
            CPH.LogWarn(
                "Spark Bot: сбрасываю поврежденный контекст: " +
                ex.Message
            );

            return new List<string>();
        }
    }
}
