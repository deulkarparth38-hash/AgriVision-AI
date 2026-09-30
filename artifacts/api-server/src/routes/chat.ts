import { Router, type IRouter } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  CreateConversationBody,
  CreateConversationResponse,
  DeleteConversationParams,
  GetConversationParams,
  GetConversationResponse,
  ListConversationsResponse,
  SendConversationMessageBody,
  SendConversationMessageParams,
  SendConversationMessageResponse,
} from "@workspace/api-zod";
import {
  conversationsTable,
  db,
  farmProfilesTable,
  messagesTable,
} from "@workspace/db";
import { currentUserId, requireAuth } from "../middlewares/require-auth";
import { aiLimiter } from "../lib/limits";
import { answerAgronomyQuestion } from "../lib/ai";

const router: IRouter = Router();

function toConversation(row: typeof conversationsTable.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMessage(row: typeof messagesTable.$inferSelect) {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/conversations", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.userId, currentUserId(req)))
    .orderBy(desc(conversationsTable.updatedAt));
  res.json(ListConversationsResponse.parse(rows.map(toConversation)));
});

router.post("/conversations", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a conversation name." });
    return;
  }
  const now = new Date();
  const [row] = await db
    .insert(conversationsTable)
    .values({
      id: randomUUID(),
      userId: currentUserId(req),
      title: parsed.data.title.trim(),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  res.status(201).json(CreateConversationResponse.parse(toConversation(row)));
});

router.get("/conversations/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid conversation id." });
    return;
  }
  const userId = currentUserId(req);
  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(and(eq(conversationsTable.id, params.data.id), eq(conversationsTable.userId, userId)))
    .limit(1);
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found." });
    return;
  }
  const messages = await db
    .select()
    .from(messagesTable)
    .where(and(eq(messagesTable.conversationId, conversation.id), eq(messagesTable.userId, userId)))
    .orderBy(asc(messagesTable.createdAt));
  res.json(
    GetConversationResponse.parse({
      conversation: toConversation(conversation),
      messages: messages.map(toMessage),
    }),
  );
});

router.post("/conversations/:id/messages", requireAuth, aiLimiter, async (req, res): Promise<void> => {
  const params = SendConversationMessageParams.safeParse(req.params);
  const body = SendConversationMessageBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Check the message and try again." });
    return;
  }
  const userId = currentUserId(req);
  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(and(eq(conversationsTable.id, params.data.id), eq(conversationsTable.userId, userId)))
    .limit(1);
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found." });
    return;
  }
  const [profile] = await db
    .select()
    .from(farmProfilesTable)
    .where(eq(farmProfilesTable.userId, userId))
    .limit(1);
  const previous = await db
    .select()
    .from(messagesTable)
    .where(and(eq(messagesTable.conversationId, conversation.id), eq(messagesTable.userId, userId)))
    .orderBy(desc(messagesTable.createdAt))
    .limit(12);
  const question = body.data.message.trim();
  const answer = await answerAgronomyQuestion({
    question,
    profile: profile
      ? {
          farmName: profile.farmName,
          region: profile.region,
          country: profile.country,
          crops: profile.crops,
          soilType: profile.soilType,
          soilPH: profile.soilPH,
          irrigation: profile.irrigation,
        }
      : null,
    history: previous.reverse().map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    })),
  });
  const now = new Date();
  const [userMessage, assistantMessage] = await db.transaction(async (tx) => {
    const [savedUser] = await tx
      .insert(messagesTable)
      .values({
        id: randomUUID(),
        conversationId: conversation.id,
        userId,
        role: "user",
        content: question,
        createdAt: now,
      })
      .returning();
    const [savedAssistant] = await tx
      .insert(messagesTable)
      .values({
        id: randomUUID(),
        conversationId: conversation.id,
        userId,
        role: "assistant",
        content: answer,
        createdAt: new Date(now.getTime() + 1),
      })
      .returning();
    await tx
      .update(conversationsTable)
      .set({ updatedAt: new Date(now.getTime() + 1) })
      .where(and(eq(conversationsTable.id, conversation.id), eq(conversationsTable.userId, userId)));
    return [savedUser, savedAssistant];
  });
  res.json(
    SendConversationMessageResponse.parse({
      userMessage: toMessage(userMessage),
      assistantMessage: toMessage(assistantMessage),
    }),
  );
});

router.delete("/conversations/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid conversation id." });
    return;
  }
  const [deleted] = await db
    .delete(conversationsTable)
    .where(and(eq(conversationsTable.id, params.data.id), eq(conversationsTable.userId, currentUserId(req))))
    .returning({ id: conversationsTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Conversation not found." });
    return;
  }
  res.sendStatus(204);
});

export default router;