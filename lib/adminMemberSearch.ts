export type AdminMemberSearchRow = {
  memberId: string;
  memberNumber: string;
  displayName: string;
  pickupName?: string;
  phone: string;
  email: string;
  loginEmail: string;
};

export type AdminMemberSearchMatch = {
  memberId: string;
  score: number;
  reason: "姓名" | "會員編號" | "Email" | "手機" | "Member ID";
  kind: "exact" | "prefix" | "partial";
};

function text(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

export function normalizeAdminMemberPhone(value: string) {
  return value.replace(/[\s()\-]/gu, "");
}

export function normalizeAdminMemberNumber(value: string) {
  return text(value).replace(/^kd-/u, "").replace(/[\s-]/gu, "");
}

function candidate(
  query: string,
  value: string,
  reason: AdminMemberSearchMatch["reason"],
  scores: { exact: number; prefix: number; partial: number },
  options: { prefixMin?: number; partialMin?: number } = {},
): Omit<AdminMemberSearchMatch, "memberId"> | null {
  if (!value) return null;
  if (query === value) return { score: scores.exact, reason, kind: "exact" };
  if (query.length >= (options.prefixMin ?? 1) && value.startsWith(query)) {
    return { score: scores.prefix, reason, kind: "prefix" };
  }
  if (query.length >= (options.partialMin ?? 2) && value.includes(query)) {
    return { score: scores.partial, reason, kind: "partial" };
  }
  return null;
}

export function searchAdminMembers<T extends AdminMemberSearchRow>(rows: T[], rawQuery: string) {
  const query = text(rawQuery);
  if (!query) return [] as Array<{ row: T; match: AdminMemberSearchMatch }>;

  const results: Array<{ row: T; match: AdminMemberSearchMatch }> = [];
  for (const row of rows) {
    const matches: Array<Omit<AdminMemberSearchMatch, "memberId">> = [];
    const names = [...new Set([row.displayName, row.pickupName ?? ""].map(text).filter(Boolean))];
    const memberId = text(row.memberId);
    const memberNumber = text(row.memberNumber);
    const memberNumberNormalized = normalizeAdminMemberNumber(row.memberNumber);
    const queryMemberNumber = normalizeAdminMemberNumber(query);
    const emails = [...new Set([row.email, row.loginEmail].map(text).filter(Boolean))];
    const phone = normalizeAdminMemberPhone(row.phone);
    const queryPhone = normalizeAdminMemberPhone(query);

    for (const name of names) {
      const nameMatch = candidate(query, name, "姓名", { exact: 500, prefix: 400, partial: 300 }, { partialMin: 2 });
      if (nameMatch) matches.push(nameMatch);
    }

    const numberMatches = [
      candidate(query, memberNumber, "會員編號", { exact: 490, prefix: 390, partial: 290 }, { prefixMin: 2, partialMin: 3 }),
      candidate(queryMemberNumber, memberNumberNormalized, "會員編號", { exact: 490, prefix: 390, partial: 290 }, { prefixMin: 2, partialMin: 3 }),
    ].filter((match): match is NonNullable<typeof match> => Boolean(match));
    matches.push(...numberMatches);

    for (const email of emails) {
      const [localPart] = email.split("@", 1);
      const haystack = query.includes("@") ? email : localPart;
      const emailMatch = candidate(query, haystack, "Email", { exact: 480, prefix: 380, partial: 280 }, { partialMin: 2 });
      if (emailMatch) matches.push(emailMatch);
    }

    if (/^\d+$/u.test(queryPhone) && queryPhone.length >= 4) {
      const phoneMatch = candidate(queryPhone, phone, "手機", { exact: 470, prefix: 370, partial: 270 }, { prefixMin: 4, partialMin: 4 });
      if (phoneMatch) matches.push(phoneMatch);
    }

    const memberIdMatch = candidate(query, memberId, "Member ID", { exact: 460, prefix: 360, partial: 260 }, { prefixMin: 2, partialMin: 4 });
    if (memberIdMatch) matches.push(memberIdMatch);

    const best = matches.sort((left, right) => right.score - left.score)[0];
    if (best) results.push({ row, match: { memberId: row.memberId, ...best } });
  }

  return results.sort((left, right) =>
    right.match.score - left.match.score ||
    left.row.displayName.localeCompare(right.row.displayName, "zh-Hant") ||
    left.row.memberNumber.localeCompare(right.row.memberNumber) ||
    left.row.memberId.localeCompare(right.row.memberId),
  );
}
