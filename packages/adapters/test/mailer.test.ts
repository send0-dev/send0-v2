import { afterEach, describe, expect, it, vi } from "vitest";
import { MailerError, SesMailer } from "../src/mailer";

afterEach(() => vi.unstubAllGlobals());
const cfg = { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "s", region: "ap-south-1", configurationSet: "send0-default" };
const input = {
  from: "kunal@send0.email",
  recipients: ["a@x.com", "b@y.com"],
  raw: "Subject: hé\r\n\r\nhi",
  tags: { msg_id: "msg_1", org_id: "org_1", bad: "a b/c" },
};

describe("SesMailer", () => {
  it("posts SendEmail v2 with raw content, config set and tags", async () => {
    let req: Request | undefined;
    vi.stubGlobal("fetch", async (r: Request) => ((req = r), Response.json({ MessageId: "0109-abc" })));
    expect(await new SesMailer(cfg).sendRaw(input)).toEqual({ providerMessageId: "0109-abc" });
    expect(req!.url).toBe("https://email.ap-south-1.amazonaws.com/v2/email/outbound-emails");
    expect(req!.headers.get("authorization")).toMatch(/Credential=AKIDEXAMPLE\/\d{8}\/ap-south-1\/ses\/aws4_request/);
    const body: any = await req!.json();
    expect(body.FromEmailAddress).toBe("kunal@send0.email");
    expect(body.Destination).toEqual({ ToAddresses: ["a@x.com", "b@y.com"] });
    expect(body.ConfigurationSetName).toBe("send0-default");
    expect(new TextDecoder().decode(Uint8Array.from(atob(body.Content.Raw.Data), (c) => c.charCodeAt(0)))).toBe(input.raw);
    expect(body.EmailTags).toContainEqual({ Name: "bad", Value: "a_b_c" });
  });

  it("turns SES errors into MailerError with retryability", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({ __type: "MessageRejected", message: "Email address is not verified." }, { status: 400 }),
    );
    const e = await new SesMailer(cfg).sendRaw(input).catch((x) => x);
    expect(e).toBeInstanceOf(MailerError);
    expect(e).toMatchObject({ status: 400, retryable: false, code: "MessageRejected" });
    expect(e.message).toContain("not verified");

    vi.stubGlobal("fetch", async () => Response.json({ __type: "TooManyRequestsException", message: "slow down" }, { status: 429 }));
    expect(await new SesMailer(cfg).sendRaw(input).catch((x) => x)).toMatchObject({ retryable: true });
  });
});
