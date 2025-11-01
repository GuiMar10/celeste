<script>
  import { onDestroy, onMount } from "svelte";
  import settingsIcon from "$lib/assets/settings.svg";

  let prompting = true;
  let prompt = "";
  let model = "minimax/minimax-m2:free";
  var systemPrompt = "";
  let loading = false;
  let ApiKey =
    "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";
  let history = [];
  let realtResponse = "";

  async function sendQuery(query) {
    if (!query) return;
    if (systemPrompt && history.length === 0)
      history = [{ role: "system", content: systemPrompt }];

    prompting = false;
    prompt = "";
    history = [...history, { role: "user", content: query }];
    loading = true;
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model,
          messages: history,
          stream: true,
        }),
      }
    );

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

  function formatResponse(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
      .replace(/\*(.*?)\*/g, "<i>$1</i>");
  }

  function handleKey(e) {
    const promptArea = document.getElementById("prompt");
    // Press any key to focus on the textarea.
    if (
      e.key.length == 1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      document.activeElement !== promptArea
    ) {
      e.preventDefault();
      promptArea.focus();
    }
    // Ctrl + Shift + O to create a new chat
    if (e.ctrlKey && e.shiftKey && e.key === "O") {
      e.preventDefault();
      prompting = true;
      prompt = "";
      history = [];
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

  onMount(() => document.addEventListener("keydown", handleKey));
  onDestroy(() => {
    if (typeof window !== "undefined")
      document.removeEventListener("keydown", handleKey);
  });
</script>

<title>ChatGPT</title>
<div id={prompting ? "center" : "bottom"}>
  {#if prompting}
    <h1>Hey, ready to dive in?</h1>
  {/if}
  <textarea
    bind:value={prompt}
    id="prompt"
    class="compact"
    placeholder="Ask anything"
  ></textarea>
</div>
{#if !prompting}
  <div id="chat">
    <div id="spacing" style="height: 80px;"></div>
    {#each history as msg}
      <div class={msg.role == "user" ? "question" : "response"}>
        {@html formatResponse(msg.content)}
      </div>
    {/each}
    <div class="response">{@html formatResponse(realtResponse)}</div>
    {#if loading}
      <div id="loading"></div>
    {/if}
    <div id="spacing" style="height: 100px;"></div>
  </div>
{/if}
<div id="settings" popover>
  <h1>Model</h1>
  <p>Select a model compatible with OpenRouter's API.</p>
  <input bind:value={model} placeholder="ex.: qwen/qwen3-30b-a3b" />
  <hr />
  <h2>Custom instructions</h2>
  <input
    bind:value={systemPrompt}
    placeholder="Give more context, ask to be more concise"
  />
</div>
<div id="sidebar">
  <button popovertarget="settings">
    <img src={settingsIcon} alt="Settings Icon" />
  </button>
</div>

<style>
  @import url("https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap");
  :root {
    background-color: #212121;
    font-family: Inter;
    color: white;

    --containerColor: rgba(255, 255, 255, 0.08);
    --containerColor: rgba(255, 41, 41, 0.4);
    --colorOutline: rgba(255, 255, 255, 0.05);
  }
  ::selection {
    background: rgba(57, 159, 255, 0.3);
    background: var(--containerColor);
  }
  :global(body) {
    margin: 0;
    padding: 0;
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
  }
  #settings::backdrop {
    background: rgb(0, 0, 0, 0.5);
    backdrop-filter: blur(1px);
  }
  #settings h1 {
    font-size: 16px;
    margin: 6px 0;
    font-weight: 500;
  }
  #settings h2 {
    font-size: 14px;
    margin: 6px 0;
    font-weight: 500;
  }
  #settings input {
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
  #settings p {
    margin: 0;
    margin-bottom: 16px;
    font-size: 14px;
    opacity: 0.4;
  }
  #settings hr {
    opacity: 0.1;
    margin: 14px 0px;
  }
  #sidebar {
    width: 55px;
    height: 100%;
    position: fixed;
    left: 0;
    padding: 6px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    border-right: 1px solid var(--colorOutline);
  }
  #sidebar button {
    bottom: 10px;
    position: absolute;
    background: transparent;
    border: 0;
    border-radius: 10px;
    cursor: pointer;
    width: calc(100% - 12px);
    padding: 6px 0px;
  }
  #sidebar button:hover {
    background: rgb(48, 48, 48, 0.9);
  }
  #sidebar button img {
    width: 22px;
    margin-bottom: -2px;
  }
  @keyframes settingsShow {
    from {
      opacity: 0;
    }
  }
  div#chat {
    width: 80%;
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
  }
  #loading {
    width: 16px;
    height: 16px;
    border-radius: 20px;
    background: white;
    animation: loading 1s infinite;
  }
  @keyframes loading {
    50% {
      scale: 0.93;
    }
  }
  .question {
    background: var(--containerColor);
    width: fit-content;
    margin-left: auto;
    margin-right: 0;
    margin-bottom: 36px;
    padding: 8px 14px;
    border-radius: 20px;
  }
  .response {
    margin-bottom: 34px;
    white-space: pre-line;
  }
  div#center {
    position: absolute;
    top: 40%;
    transform: translateY(-50%);
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  div#center h1 {
    text-align: center;
    font-weight: 500;
  }
  div#bottom {
    position: fixed;
    bottom: 20px;
    display: flex;
    top: auto;
    width: 100%;
    flex-direction: column;
    z-index: 10;
    justify-content: center;
  }
  textarea {
    background: rgb(48, 48, 48, 0.9);
    backdrop-filter: blur(8px);
    border: 1px solid rgb(255, 255, 255, 0.07);
    color: white;
    border-radius: 30px;
    font-size: 16px;
    padding: 10px 20px;
    box-shadow: 1px 1px 10px 2px rgb(0, 0, 0, 0.2);
    height: 22px !important;
    width: 70%;
    max-width: 700px;
    margin: 0 auto;
    align-items: center;
    resize: none;
    font-family: Inter !important;
    outline: 0;
  }
  textarea.compact {
    padding: 15px 20px;
  }
  @keyframes activateMode {
    50% {
      scale: 0.9;
    }
  }
</style>
