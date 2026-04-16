import { requireUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>My profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div>
          <span className="text-muted-foreground">Name:</span>{" "}
          {user.firstName} {user.lastName}
        </div>
        <div>
          <span className="text-muted-foreground">Email:</span> {user.email}
        </div>
        <div>
          <span className="text-muted-foreground">Role:</span> {user.role}
        </div>
        <div>
          <span className="text-muted-foreground">Status:</span> {user.status}
        </div>
      </CardContent>
    </Card>
  );
}
