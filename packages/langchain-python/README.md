# langchain-send0

[send0](https://send0.dev) tools for [LangChain](https://python.langchain.com) and LangGraph. Give an agent its own email inbox: sign up for things, read verification codes, and hold real email conversations.

```bash
pip install langchain-send0
```

## Usage

```python
from langchain.agents import create_agent
from langchain_send0 import Send0Toolkit

tools = Send0Toolkit().get_tools()  # reads SEND0_API_KEY

agent = create_agent("anthropic:claude-opus-5-5", tools=tools)
result = agent.invoke(
    {"messages": [{"role": "user", "content": "Create an inbox called signup-agent and tell me its address."}]}
)
```

Every tool runs synchronously (`invoke`) and asynchronously (`ainvoke`, using send0's async client), so it works in sync scripts and async agents alike.

## Tools

| Tool              | What it does                                                                 | Kind      |
| ----------------- | ---------------------------------------------------------------------------- | --------- |
| `create_inbox`    | Make a new address, e.g. `signup-agent@send0.email`                          | Creates   |
| `list_inboxes`    | Inboxes this key can use                                                     | Read-only |
| `wait_for_email`  | Block until a matching email arrives; returns the code and link it extracted | Read-only |
| `search_messages` | Full-text search, filter by sender (`*@github.com`) or direction             | Read-only |
| `get_message`     | Read one message (new text only by default, to save tokens)                  | Read-only |
| `list_threads`    | Conversations in an inbox, most recent first                                 | Read-only |
| `get_thread`      | A whole conversation, oldest first                                           | Read-only |
| `send_email`      | Start a new thread                                                           | Sends     |
| `reply`           | Answer in the same thread                                                    | Sends     |

## Options

```python
Send0Toolkit(
    client=None,            # a configured send0.Send0; by default one is made from api_key
    api_key=None,           # default: the SEND0_API_KEY environment variable
    inbox_id="ibx_…",       # default inbox, so the model doesn't need inbox_id
    include=["create_inbox", "wait_for_email"],  # only these tools
    exclude=["send_email", "reply"],             # or everything but these
    async_client=None,      # a configured send0.AsyncSend0, for ainvoke
    base_url=None,          # self-hosted send0
)
```

If you pass `client` without `async_client`, async calls run the sync client in a thread.

## Approval

`send_email` and `reply` have `sends = True`. To have a person approve them before they run, use LangChain's human-in-the-loop middleware (it needs a checkpointer):

```python
from langchain.agents import create_agent
from langchain.agents.middleware import HumanInTheLoopMiddleware
from langgraph.checkpoint.memory import InMemorySaver

agent = create_agent(
    "anthropic:claude-opus-5-5",
    tools=Send0Toolkit().get_tools(),
    checkpointer=InMemorySaver(),
    middleware=[HumanInTheLoopMiddleware(interrupt_on={"send_email": True, "reply": True})],
)
```

Or leave them out with `exclude=["send_email", "reply"]`. An API key limited to one inbox, and an inbox with the `approval` send policy, are the safest setup for an agent.

## Untrusted content

Email is written by strangers. Tools that return mail wrap each body in `<untrusted_email>` tags with a note to treat it as data, and messages send0 flags for prompt injection carry a visible warning. Don't give an agent that reads email tools it shouldn't be talked into using.

## Errors

API errors are returned to the model as text, for example `send0 error recipient_not_allowed: …`, so it can recover instead of the run failing.

## License

MIT
