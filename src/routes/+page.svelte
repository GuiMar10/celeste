<script>
  import { onMount } from "svelte";

  let prompting = true;
  let prompt = "";
  let loading = false;
  let ApiKey =
    "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";
  let history = [];
  let realtResponse = "";
  async function sendQuery(query) {
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
          model: "qwen/qwen3-30b-a3b:free",
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

  onMount(() => {
    const promptArea = document.getElementById("prompt");
    document.addEventListener("keydown", function (event) {
      if (
        event.key.match(/^[a-zA-Z]$/) &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        document.activeElement !== promptArea
      ) {
        event.preventDefault();
        promptArea.focus();
      }
      if (event.key.match("o") && event.shiftKey && event.ctrlKey) {
        event.preventDefault();
        prompting = true;
        prompt = "";
        history = [];
      }
      if (event.key.match("Enter") && !event.shiftKey) {
        event.preventDefault();
        sendQuery(prompt);
      }
    });
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
    <div class="response">{realtResponse}</div>
    {#if loading}
      <div id="loading"></div>
    {/if}
    <div id="spacing" style="height: 100px;"></div>
  </div>
{/if}

<style>
  @import url("https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap");
  :root {
    background-color: #212121;
    font-family: Inter;
    color: white;
  }
  ::selection {
    background: rgba(57, 159, 255, 0.3);
  }
  :global(body) {
    margin: 0;
    padding: 0;
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
    100% {
      scale: 1;
    }
  }
  .question {
    background: rgba(255, 255, 255, 0.08);
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
</style>
