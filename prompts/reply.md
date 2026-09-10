# MODE: reply
The lead already received our ice-breaker (and maybe more). They sent a new message — the thread is mid-conversation.
Decide the next CRM move and optionally write a reply.
Return STRICT JSON only (no markdown fences):
{
  "intent": "continue" | "book" | "lost" | "hold",
  "reason": "short",
  "lost_reason": "not_interested" | "wrong_person" | "no_budget" | "bad_timing" | "has_solution" | "competitor" | "unsubscribe" | "hostile" | "non_fit" | "other",
  "booked_slot_id": "",
  "reply": "plain text message to send, or empty string if no send",
  "notes_append": "1-3 short bullets for CRM page notes",
  "status": "Conversation 💬" | "Active ✅" | "Lost❌"
}
Rules:
- Follow the Sales policy block (target portrait + primary outcome) when choosing status.
- book / Active ✅ ONLY when the primary outcome is clearly met. Soft interest ≠ Active.
- For book_a_call: soft yes-to-a-call ≠ Active. Propose ONLY times from the Booking offers block (already in lead TZ). Set booked_slot_id to the exact id when they accept that slot. Never invent clock times. Include Meet link only if present in Booking offers.
- lost / Lost❌ for refusal, wrong person, hostile, unsubscribe, or clear non-fit outside the target portrait after engagement.
- When intent is lost: set lost_reason to EXACTLY one enum value (best single match). Leave empty if not lost.
- continue / hold stay on Conversation 💬
- reply must follow the playbook voice; no placeholders
- Do NOT greet again (no "Hi/Hello/Hey <name>"). Jump straight into the answer.
- Do NOT end with a sign-off or signature (no Cheers / Best / Regards / Thanks, and no name line). This is not the first message.
