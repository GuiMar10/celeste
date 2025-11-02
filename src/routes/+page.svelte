<script>
  import { onDestroy, onMount } from "svelte";
  import settingsIcon from "$lib/assets/settings.svg";
  import newChatIcon from "$lib/assets/newChat.svg";
  import sidebar from "$lib/assets/sidebar.svg";
  import send from "$lib/assets/send.svg";
  import {
    openDB,
    addChat,
    updateChat,
    getAllChatInfo,
    getChat,
    deleteChat,
  } from "$lib/db.js";

  let prompting = true;
  let prompt = "";
  let model = "x-ai/grok-4-fast";
  var systemPrompt = "Use emojis and markdown. Be short and concise.";
  let loading = false;
  let reasonEnabled = false;
  let history = [];
  let realtResponse = "";
  let sidebarExpanded = false;

  let savedChats = [];
  let currentChatId = null; // null means it's a new chat

  const greetings = [
    "Hey, ready to dive in?",
    "What's on your mind today?",
    "What are you working on?",
  ];

  function getGreeting() {
    const randomIndex = Math.floor(Math.random() * greetings.length);
    return greetings[randomIndex];
  }

  function newChat() {
    prompting = true;
    prompt = "";
    history = [];
    currentChatId = null;
  }

  async function loadChatsForSidebar() {
    try {
      savedChats = await getAllChatInfo();
    } catch (error) {
      console.error("Failed to load chats:", error);
    }
  }

  async function loadChat(id) {
    try {
      const loadedHistory = await getChat(id);
      history = loadedHistory;
      currentChatId = id;
      prompting = false;
      prompt = "";
      realtResponse = "";
      loading = false;
    } catch (error) {
      console.error("Failed to load chat:", error);
    }
  }

  async function handleDeleteChat(id) {
    if (confirm("Are you sure you want to delete this chat?")) {
      try {
        await deleteChat(id);
        // Remove from sidebar
        savedChats = savedChats.filter((chat) => chat.id !== id);
        // If it was the active chat, start a new one
        if (currentChatId === id) {
          newChat();
        }
      } catch (error) {
        console.error("Failed to delete chat:", error);
      }
    }
  }

  async function sendQuery(query) {
    if (!query) return;
    if (systemPrompt && history.length === 0)
      history = [{ role: "system", content: systemPrompt }];

    document.querySelector("#prompt").classList.remove("big");
    document.querySelector("#prompt").classList.add("compact");
    prompting = false;
    prompt = "";
    history = [...history, { role: "user", content: query }];
    loading = true;

    // Save the history
    const historySnapshot = [...history];
    let newChatInfo = null;

    try {
      if (currentChatId === null) {
        // This is a new chat. Add it to DB.
        newChatInfo = await addChat(historySnapshot);
        currentChatId = newChatInfo.id;
        // Add to sidebar list
        savedChats = [newChatInfo, ...savedChats];
      } else {
        // This is an existing chat. Update it.
        await updateChat(currentChatId, historySnapshot);
      }
    } catch (error) {
      console.error("Failed to save chat:", error);
    }

    const response = await fetch("/api/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: history,
        stream: true,
        reasoning: {
          // effort: "medium",
          enabled: reasonEnabled,
        },
        /*
        // Not needed when using Grok
        plugins: [
          {
            id: "web",
          },
        ],*/
      }),
    });

    const reader = response.body?.getReader();

    if (!reader) {
      throw new Error("Response body is not readable");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // Append new chunk to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete lines from buffer
        while (true) {
          const lineEnd = buffer.indexOf("\n");
          if (lineEnd === -1) break;
          const line = buffer.slice(0, lineEnd).trim();
          buffer = buffer.slice(lineEnd + 1);

          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0].delta.content;

              if (content) {
                loading = false;
                realtResponse += content;
              }
            } catch (e) {
              // Ignore invalid JSON
            }
          }
        }
      }
    } finally {
      reader.cancel();
      history = [...history, { role: "assistant", content: realtResponse }];

      // Add to DB
      if (currentChatId) {
        try {
          await updateChat(currentChatId, history);
        } catch (error) {
          console.error("Failed to save final chat history:", error);
        }
      }

      document.documentElement.scrollTo({
        left: 0,
        top:
          document.documentElement.scrollHeight -
          document.documentElement.clientHeight,
        behavior: "smooth",
      });
      realtResponse = "";
    }
  }

  function toggleSidebar() {
    sidebarExpanded = !sidebarExpanded;
    const sidebar = document.querySelector(".sidebar");
    if (sidebarExpanded) {
      document.documentElement.style.setProperty("--sidebarSize", "240px");
    } else {
      document.documentElement.style.setProperty("--sidebarSize", "55px");
    }
    sidebar.classList.toggle("expanded", sidebarExpanded);
    sidebar.classList.toggle("compact", !sidebarExpanded);
  }

  function formatResponse(text) {
    let escaped = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Convert Markdown headings and formatting
    let formatted = escaped
      .replace(/^###### (.*$)/gm, "<h6>$1</h6>")
      .replace(/^##### (.*$)/gm, "<h5>$1</h5>")
      .replace(/^#### (.*$)/gm, "<h4>$1</h4>")
      .replace(/^### (.*$)/gm, "<h3>$1</h3>")
      .replace(/^## (.*$)/gm, "<h2>$1</h2>")
      .replace(/^# (.*$)/gm, "<h1>$1</h1>")
      .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
      .replace(/\*(.*?)\*/g, "<i>$1</i>")
      // Code blocks (triple backticks)
      .replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
      // Inline code (single backticks)
      .replace(/`([^`]+)`/g, "<code>$1</code>");

    // Detect inline HTML (escaped like &lt;div&gt;) and wrap in <code>
    formatted = formatted.replace(
      /(&lt;\/?[a-z][^&]*?&gt;)/gi,
      "<code>$1</code>"
    );

    return formatted;
  }

  function handleKey(e) {
    const promptArea = document.getElementById("prompt");
    // Press any key to focus on the textarea.
    if (
      e.key.length == 1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      document.activeElement !== promptArea &&
      document.activeElement.tagName !== "INPUT"
    ) {
      e.preventDefault();
      promptArea.focus();
    }
    // Ctrl + Shift + O to create a new chat
    if (e.ctrlKey && e.shiftKey && e.key === "O") {
      e.preventDefault();
      newChat();
    }
    // Esc to open settings
    if (e.key.match("Esc")) {
      e.preventDefault();
      document.getElementById("settings").togglePopover();
    }
    // Enter to send the query
    if (
      e.key == "Enter" &&
      !e.shiftKey &&
      document.activeElement === promptArea
    ) {
      e.preventDefault();
      sendQuery(prompt);
    }
  }

  onMount(() => {
    if (localStorage.getItem("model")) model = localStorage.getItem("model");
    if (localStorage.getItem("sysPrompt"))
      systemPrompt = localStorage.getItem("sysPrompt");
    document.addEventListener("keydown", handleKey);

    openDB().then(() => {
      loadChatsForSidebar(); // Load chat list on start
    });
  });
  onDestroy(() => {
    if (typeof window !== "undefined")
      document.removeEventListener("keydown", handleKey);
  });
</script>

<title>ChatGPT</title>
<div
  style="transition: 0.4s cubic-bezier(0,.65,.21,1)"
  id={prompting ? "center" : "bottom"}
>
  {#if prompting}
    <h1>{getGreeting()}</h1>
  {/if}
  <div class="prompt-container">
    <textarea
      on:input={(e) => {
        const el = e.target;
        const shouldExpand = el.scrollHeight > 60 && el.value.length > 0;
        el.classList.toggle("big", shouldExpand);
        el.classList.toggle("compact", !shouldExpand);
      }}
      bind:value={prompt}
      id="prompt"
      class="compact"
      placeholder="Ask anything"
    ></textarea>
    <button
      id="send-button"
      on:click={() => {
        sendQuery(prompt);
      }}
      disabled={!prompt}
    >
      <img style="margin-top: 2px;" width="22" src={send} alt="Send" />
    </button>
  </div>
</div>
{#if !prompting}
  <div id="chat">
    <div id="spacing" style="height: 80px;"></div>
    {#each history as msg}
      {#if msg.role !== "system"}
        <div class={msg.role == "user" ? "question" : "response"}>
          {@html formatResponse(msg.content)}
        </div>
      {/if}
    {/each}
    <div class="response">{@html formatResponse(realtResponse)}</div>
    {#if loading}
      {#if reasonEnabled}
        <div id="reasoning">Thinking...</div>
      {:else}
        <div id="loading"></div>
      {/if}
    {/if}
    <div id="spacing" style="height: 100px;"></div>
  </div>
{/if}
<div id="settings" popover>
  <h1>Model</h1>
  <p>Select a model compatible with OpenRouter's API.</p>
  <input
    on:change={(e) => {
      localStorage.setItem("model", e.target.value);
    }}
    bind:value={model}
    placeholder="ex.: qwen/qwen3-30b-a3b"
  />
  <hr />
  <h2>Custom instructions</h2>
  <input
    bind:value={systemPrompt}
    on:change={(e) => {
      localStorage.setItem("sysPrompt", e.target.value);
    }}
    placeholder="Give more context, ask to be more concise"
  />
</div>
<div class="sidebar compact">
  <button
    class="icon"
    on:click={toggleSidebar}
    style="cursor: e-resize; margin-bottom: 15px; opacity: 0.7;"
  >
    <img src={sidebar} alt="Toggle sidebar" />
    <span>Toggle sidebar</span>
  </button>
  <button class="icon" on:click={newChat}>
    <img src={newChatIcon} alt="New Chat" />
    <span>New Chat</span>
  </button>
  <div id="chat-list">
    <p>Chats</p>
    {#each savedChats as chat (chat.id)}
      <button
        class="chat-item"
        on:click={() => loadChat(chat.id)}
        on:mousedown={(e) => {
          if (e.button === 1) {
            e.preventDefault();
            handleDeleteChat(chat.id);
          }
        }}
      >
        <span>{chat.title}</span>
      </button>
    {/each}
  </div>
  <div style="position: absolute; bottom: 10px; width: calc(100% - 12px);">
    <button class="icon" popovertarget="settings">
      <img src={settingsIcon} alt="Settings Icon" />
    </button>
  </div>
</div>

<style lang="scss">
  @import url("https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap");
  :root {
    color-scheme: dark light;
    background-color: var(--bgColor);
    font-family: Inter;
    color: var(--textColor);

    --sidebarSize: 55px;

    --primaryColor: light-dark(black, white);
    --containerColor: light-dark(
      rgba(0, 0, 0, 0.08),
      rgba(255, 255, 255, 0.08)
    );

    /* Custom theme 
    --primaryColor: light-dark(black, rgb(255, 114, 114));
    --containerColor: rgba(255, 84, 84, 0.3);

    --primaryColor: light-dark(black, rgb(152, 255, 56));
    --containerColor: rgba(149, 255, 43, 0.3);
    */

    --bgColor: light-dark(#fff, #212121);
    --textColor: light-dark(black, white);
    --promptBgColor: light-dark(
      rgba(255, 255, 255, 0.9),
      rgba(50, 50, 50, 0.9)
    );
    --promptBorderColor: light-dark(
      rgba(0, 0, 0, 0.2),
      rgba(255, 255, 255, 0.09)
    );
    --colorOutline: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
  }
  ::selection {
    background: rgba(57, 159, 255, 0.3);
    background: var(--containerColor);
  }
  :global(body) {
    margin: 0;
    padding: 0;
  }
  #send-button {
    background: var(--primaryColor);
    border: none;
    width: 35px;
    height: 35px;
    border-radius: 40px;
    margin: 0;
    transform: translateY(-9px) translateX(-10px);
    cursor: pointer;
    &:disabled {
      opacity: 0.2;
      cursor: default;
    }
  }

  #settings {
    background: #212121;
    color: white;
    padding: 14px;
    box-sizing: border-box;
    border-radius: 16px;
    border: 1px solid var(--colorOutline);
    width: 50%;
    box-shadow: 1px 1px 14px 1px rgb(0, 0, 0, 0.5);
    animation: 0.2s settingsShow;
    &::backdrop {
      background: rgb(0, 0, 0, 0.5);
      backdrop-filter: blur(1px);
    }
    & h1 {
      font-size: 16px;
      margin: 6px 0;
      font-weight: 500;
    }
    & h2 {
      font-size: 14px;
      margin: 6px 0;
      font-weight: 500;
    }
    & input {
      color: white;
      outline: 0;
      background: var(--colorOutline);
      border: 1px solid var(--colorOutline);
      border-radius: 8px;
      font-size: 15px;
      padding: 6px 8px;
      box-sizing: border-box;
      width: 100%;
      margin-top: 4px;
    }
    & p {
      margin: 0;
      margin-bottom: 16px;
      font-size: 14px;
      opacity: 0.4;
    }
    & hr {
      opacity: 0.1;
      margin: 14px 0px;
    }
  }
  .sidebar {
    width: var(--sidebarSize);
    height: 100%;
    position: fixed;
    left: 0;
    padding: 6px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--colorOutline);
    transition: 0.1s;
    & button {
      bottom: 10px;
      background: transparent;
      border: 0;
      border-radius: 10px;
      cursor: pointer;
      width: 100%;
      text-align: left;
      padding: 6px 8px;
      &:hover {
        background: light-dark(rgba(226, 226, 226, 0.9), rgb(48, 48, 48, 0.9));
      }
      &.icon {
        text-align: center;
      }
      & img {
        width: 20px;
        margin-bottom: -2px;
      }
    }
    & #chat-list p {
      opacity: 0.5;
      margin: 0;
      margin-top: 16px;
      margin-left: 6px;
      font-size: 14px;
      margin-bottom: 6px;
    }
  }
  .prompt-container {
    display: flex;
    align-items: flex-end;
    background: var(--promptBgColor);
    backdrop-filter: blur(8px);
    border: 1px solid var(--promptBorderColor);
    box-shadow: 1px 1px 10px 2px
      light-dark(rgb(0, 0, 0, 0.05), rgb(0, 0, 0, 0.2));
    width: 70%;
    max-width: 700px;
    margin: 0 auto;
    transition:
      all 0.2s,
      background 0;

    &:has(textarea.compact) {
      border-radius: 30px;
    }
    &:has(:global(textarea.big)) {
      border-radius: 26px !important;
    }
  }
  :global(.sidebar.compact) {
    background: transparent;
    & #chat-list {
      display: none;
    }
    & button.icon span {
      display: none;
    }
  }
  :global(.sidebar.expanded) {
    background: light-dark(#f9f9f9, #181818);
    & button {
      text-align: left;
    }
    & button.icon span {
      display: inline-block;
      vertical-align: 3px;
      font-size: 14px;
      margin-left: 4px;
    }
  }
  #reasoning {
    background: linear-gradient(
      90deg,
      rgb(255, 255, 255, 0.6) 35%,
      #5e5e5e 50%,
      rgb(255, 255, 255, 0.6) 65%
    );
    cursor: default;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    background-size: 200% auto;
    animation: textShine 1s linear infinite;
  }
  @keyframes textShine {
    0% {
      background-position: 0% center;
    }
    100% {
      background-position: 200% center;
    }
  }
  @keyframes settingsShow {
    from {
      opacity: 0;
    }
  }
  div#chat {
    position: absolute;
    left: calc(10% + var(--sidebarSize));
    right: 10%;
    max-width: 800px;
    margin: 0 auto;
    transition: 0.2s;
  }
  #loading {
    width: 16px;
    height: 16px;
    border-radius: 20px;
    background: var(--textColor);
    animation: loading 1s infinite;
  }
  @keyframes loading {
    50% {
      scale: 0.93;
    }
  }
  .question,
  .response {
    margin-bottom: 36px;
    white-space: pre-line;
  }
  .question {
    background: var(--containerColor);
    width: fit-content;
    margin-left: auto;
    margin-right: 0;
    padding: 10px 14px;
    border-radius: 20px;
  }
  div#center,
  div#bottom {
    display: flex;
    flex-direction: column;
    width: calc(100% - var(--sidebarSize));
    justify-content: center;
    margin-left: var(--sidebarSize);
  }
  div#center {
    position: absolute;
    top: 40%;
    transform: translateY(-50%);
  }
  div#center h1 {
    text-align: center;
    font-size: 30px;
    font-weight: 500;
    margin-bottom: 26px;
  }
  div#bottom {
    position: fixed;
    top: auto;
    z-index: 10;
    background: linear-gradient(transparent, var(--bgColor) 50%);
    bottom: 0;
    padding-bottom: 20px;
  }
  textarea {
    color: var(--textColor);
    font-size: 16px;
    resize: none;
    font-family: Inter !important;
    outline: 0;
    flex-grow: 1;
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    transition: height 0.2s;
    &::placeholder {
      color: light-dark(rgba(0, 0, 0, 0.5), rgba(255, 255, 255, 0.5));
    }
    &.compact {
      padding: 15px 20px;
      height: 22px !important;
    }
  }
  :global(.big) {
    padding: 15px 15px !important;
    border-radius: 26px !important;
    height: 70px !important;
  }
  @keyframes activateMode {
    0% {
      scale: 0.95;
    }
  }
  :global(code) {
    background: light-dark(rgb(238, 238, 238), rgb(19, 19, 19));
    color: var(--textColor);
    padding: 2px;
    border-radius: 2px;
    &::selection {
      background: rgba(57, 159, 255, 0.3);
      background: var(--containerColor);
    }
  }
  :global(pre) {
    background: #171717;
    color: #dcdcdc;
    padding: 12px 16px;
    border-radius: 10px;
    overflow-x: auto;
    margin: 1em 0;
  }
  :global(pre code) {
    background: none; /* remove inline code background */
    color: inherit;
    font-family: monospace;
    font-size: 1.1em;
    white-space: pre-wrap; /* optional: wrap long lines */
  }

  @media (prefers-color-scheme: light) {
    .sidebar button img {
      filter: invert(1) brightness(2);
    }
    #send-button img {
      filter: invert(1);
    }
  }
</style>
