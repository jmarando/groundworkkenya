import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mail, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { invitePollIndividuals } from "@/lib/poll-invitations.functions";

export function PollRecipients({ poll, onClose }: { poll: { id: string; code: string; question: string; status: string }; onClose: () => void }) {
  const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [recipients, setRecipients] = useState("");
  const [permission, setPermission] = useState(false);
  const send = useServerFn(invitePollIndividuals);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => send({ data: { pollId: poll.id, channel, recipients, permission } }),
    onSuccess: async () => {
      await Promise.all(["polling", "inbox", "poll-detail"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    },
  });
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !mutation.isPending) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send poll to individuals</DialogTitle>
          <DialogDescription>{poll.code} · {poll.question}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2" role="group" aria-label="Invitation channel">
          <Button variant={channel === "whatsapp" ? "default" : "outline"} disabled={mutation.isPending || !!mutation.data} onClick={() => { setChannel("whatsapp"); setRecipients(""); setPermission(false); mutation.reset(); }} aria-pressed={channel === "whatsapp"}><MessageCircle /> WhatsApp</Button>
          <Button variant={channel === "email" ? "default" : "outline"} disabled={mutation.isPending || !!mutation.data} onClick={() => { setChannel("email"); setRecipients(""); setPermission(false); mutation.reset(); }} aria-pressed={channel === "email"}><Mail /> Email</Button>
        </div>
        <label htmlFor="poll-recipients" className="text-sm font-medium">{channel === "email" ? "Email addresses" : "Phone numbers"}</label>
        <Textarea id="poll-recipients" rows={5} value={recipients} onChange={(e) => setRecipients(e.target.value)} disabled={mutation.isPending || !!mutation.data} placeholder={channel === "email" ? "name@example.com\nother@example.com" : "0712 345 678\n+254 722 123 456"} />
        <p className="text-sm text-muted-foreground">Up to 20 recipients, separated by lines or commas. Contacts must already be in this campaign’s People list.</p>
        <label className="flex items-start gap-3 text-sm">
          <Checkbox checked={permission} onCheckedChange={(value) => setPermission(value === true)} disabled={mutation.isPending || !!mutation.data} aria-label="Recipients agreed to this invitation" />
          <span>These recipients agreed to receive this poll invitation.</span>
        </label>
        {poll.status === "draft" && <p className="text-sm text-muted-foreground">Sending opens this poll for replies without messaging its group audience.</p>}
        {mutation.isError && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
        {mutation.data && <div role="status" className="space-y-3 border-t border-border pt-3">
          {mutation.data.results.map((r) => <div key={r.recipient} className="text-sm"><strong className="break-all">{r.recipient}</strong><p className="text-muted-foreground">{r.status === "accepted" ? "Accepted" : r.status === "failed" ? "Failed" : r.status === "sending" ? "Unconfirmed" : "Skipped"} · {r.note}</p></div>)}
        </div>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={mutation.isPending} onClick={onClose}>{mutation.data ? "Done" : "Cancel"}</Button>
          {!mutation.data && <Button disabled={!permission || !recipients.trim() || mutation.isPending} onClick={() => mutation.mutate()}><Send />{mutation.isPending ? "Sending…" : "Send invitations"}</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}