export type TrendItem = {
	title_ja: string;
	url: string;
	summary_ja: string;
};

export type TrendCategory = {
	name: string;
	items: TrendItem[];
};

export type TrendDay = {
	date: string;
	categories: TrendCategory[];
};

const modules = import.meta.glob('./data/*.json', { eager: true }) as Record<
	string,
	{ default: TrendDay }
>;

export const trendDays: TrendDay[] = Object.values(modules)
	.map((m) => m.default)
	.sort((a, b) => (a.date < b.date ? 1 : -1));

export function getTrendDay(date: string): TrendDay | undefined {
	return trendDays.find((d) => d.date === date);
}

export function totalItemCount(day: TrendDay): number {
	return day.categories.reduce((sum, c) => sum + c.items.length, 0);
}

/** ヘッダーのタブの並び順。ここに無い大分類は末尾に追加される */
export const TAB_ORDER = ['AIツール', 'AIモデル', 'AI倫理', 'Security', '開発', 'キャリア・組織', 'その他'];

export type TrendWeek = {
	/** 週の初め（日曜日）の日付 YYYY-MM-DD */
	start: string;
	/** 週の終わり（土曜日）の日付 YYYY-MM-DD */
	end: string;
	/** その週に含まれる日（日付降順） */
	days: TrendDay[];
};

export type WeekArticle = {
	item: TrendItem;
	date: string;
	/** カテゴリ名の "/" 以降（例: "エージェント開発・実装"）。"/" が無ければ空文字 */
	label: string;
};

export type TrendGroup = {
	/** ヘッダーのタブに表示する大分類（例: "AIツール", "Security"） */
	name: string;
	/** 日付降順（同じ日の中はデータの並び順） */
	articles: WeekArticle[];
};

function shiftDate(date: string, days: number): string {
	const [y, m, d] = date.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** その日を含む週の日曜日 */
export function weekStartOf(date: string): string {
	const [y, m, d] = date.split('-').map(Number);
	return shiftDate(date, -new Date(Date.UTC(y, m - 1, d)).getUTCDay());
}

export const trendWeeks: TrendWeek[] = (() => {
	const weeks = new Map<string, TrendWeek>();
	for (const day of trendDays) {
		const start = weekStartOf(day.date);
		let week = weeks.get(start);
		if (!week) {
			week = { start, end: shiftDate(start, 6), days: [] };
			weeks.set(start, week);
		}
		week.days.push(day);
	}
	return [...weeks.values()];
})();

/** 指定日を含む週（日曜日以外の日付でも可） */
export function getTrendWeek(date: string): TrendWeek | undefined {
	const start = weekStartOf(date);
	return trendWeeks.find((w) => w.start === start);
}

export function weekItemCount(week: TrendWeek): number {
	return new Set(week.days.flatMap((d) => d.categories.flatMap((c) => c.items.map((i) => i.url))))
		.size;
}

/** カテゴリ名の "AIツール/..." の接頭辞で大分類にまとめ、TAB_ORDER の順に並べる */
export function groupWeek(week: TrendWeek): TrendGroup[] {
	const groups = new Map<string, TrendGroup>();
	// 同じ週に再掲された記事は、新しい日付の1件だけを残す
	const seen = new Set<string>();
	for (const day of week.days) {
		for (const cat of day.categories) {
			const slash = cat.name.indexOf('/');
			const name = slash === -1 ? cat.name : cat.name.slice(0, slash);
			const label = slash === -1 ? '' : cat.name.slice(slash + 1);
			let group = groups.get(name);
			if (!group) {
				group = { name, articles: [] };
				groups.set(name, group);
			}
			for (const item of cat.items) {
				if (seen.has(item.url)) continue;
				seen.add(item.url);
				group.articles.push({ item, date: day.date, label });
			}
		}
	}
	const rank = (name: string) => {
		const i = TAB_ORDER.indexOf(name);
		return i === -1 ? TAB_ORDER.length : i;
	};
	// days は日付降順なので、各グループの articles も日付降順になっている
	return [...groups.values()].sort((a, b) => rank(a.name) - rank(b.name));
}

export function adjacentWeeks(start: string): { newer?: string; older?: string } {
	const i = trendWeeks.findIndex((w) => w.start === start);
	if (i === -1) return {};
	return { newer: trendWeeks[i - 1]?.start, older: trendWeeks[i + 1]?.start };
}
