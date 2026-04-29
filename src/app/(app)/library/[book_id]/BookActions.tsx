"use client";

import { useState, useTransition } from "react";
import { selfCheckoutAction, reserveAction, cancelMyReservationAction } from "./actions";

type Props = {
  bookId: string;
  availableCount: number;
  myActiveLoan: { id: string; due_at: string } | null;
  myReservation: { id: string } | null;
  queueLength: number;
};

export function BookActions({ bookId, availableCount, myActiveLoan, myReservation, queueLength }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (myActiveLoan) {
    return (
      <div className="text-sm text-slate-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        You have this book until {new Date(myActiveLoan.due_at).toLocaleDateString()}.
      </div>
    );
  }

  if (myReservation) {
    return (
      <div className="space-y-2">
        <div className="text-sm text-slate-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
          You're on the wait list ({queueLength} total{queueLength === 1 ? "" : ""}).
        </div>
        <button
          type="button"
          onClick={() => startTransition(() => cancelMyReservationAction(myReservation.id, bookId))}
          className="text-xs text-slate-500 hover:text-red-600"
        >
          Cancel reservation
        </button>
      </div>
    );
  }

  if (availableCount > 0) {
    return (
      <>
        <button
          type="button"
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const res = await selfCheckoutAction(bookId);
              if (res.error) setError(res.error);
            });
          }}
          className="w-full sm:w-auto text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
        >
          Borrow
        </button>
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await reserveAction(bookId);
            if (res.error) setError(res.error);
          });
        }}
        className="w-full sm:w-auto text-sm font-medium bg-amber-500 text-white px-4 py-2 rounded-lg hover:bg-amber-600"
      >
        Reserve (wait list)
      </button>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </>
  );
}
