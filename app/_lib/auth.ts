import { cache } from "react";
import { getCurrentMember } from "@/lib/auth";

// Request-scoped dedupe: the header and the page share one lookup.
export const getCurrentMemberCached = cache(getCurrentMember);
