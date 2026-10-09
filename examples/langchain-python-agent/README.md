# LangChain (Python): answer email with approval

A [LangChain](https://python.langchain.com) agent with `langchain-send0` finds the latest conversation waiting for an answer and replies to it. Every `send_email` and `reply` stops for your approval first.

| Variable            |                                                |
| ------------------- | ---------------------------------------------- |
| `SEND0_API_KEY`     | A send0 API key (https://app.send0.dev)        |
| `ANTHROPIC_API_KEY` | For the model; swap the provider to use others |

Needs [uv](https://docs.astral.sh/uv/). It installs the send0 packages from this repo. In your own project, `pip install langchain-send0`.

```sh
cd examples/langchain-python-agent
SEND0_API_KEY=s0_… ANTHROPIC_API_KEY=sk-ant-… uv run main.py ibx_…
```
