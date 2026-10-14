/** Narrow centered card used by the sign-in, sign-up and password pages. */
export function AuthCard({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md py-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      {intro && <p className="mt-2 text-sm text-gray-600">{intro}</p>}
      <div className="mt-6 rounded-lg border p-5 sm:p-6">{children}</div>
    </div>
  );
}
