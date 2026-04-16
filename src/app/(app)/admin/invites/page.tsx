"use client";

import { useActionState } from "react";
import { sendInviteAction, type InviteFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const initialState: InviteFormState = { status: "idle" };

export default function InvitesPage() {
  const [state, formAction, isPending] = useActionState(
    sendInviteAction,
    initialState,
  );

  return (
    <div className="max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Send invite</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" name="firstName" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" name="lastName" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>

            {state.status === "error" && (
              <p className="text-sm text-red-600">{state.message}</p>
            )}
            {state.status === "success" && state.inviteUrl && (
              <div className="rounded-md bg-green-50 p-3 text-sm">
                <p className="font-medium text-green-900">Invite created.</p>
                <p className="mt-1 break-all text-green-800">
                  Share this link:
                </p>
                <code className="mt-1 block break-all text-xs">
                  {state.inviteUrl}
                </code>
              </div>
            )}

            <Button type="submit" disabled={isPending}>
              {isPending ? "Sending…" : "Send invite"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
