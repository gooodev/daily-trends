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

export type TrendSection = {
	/** カテゴリ名の "/" 以降（例: "エージェント開発・実装"）。"/" が無い場合はカテゴリ名そのもの */
	label: string;
	items: TrendItem[];
};

export type TrendGroup = {
	/** ヘッダーのタブに表示する大分類（例: "AI", "Sec", "開発"） */
	name: string;
	sections: TrendSection[];
};

/**
 * 日ごとに揺れる細かいカテゴリ名を "AI/..." の接頭辞で大分類にまとめる。
 * ヘッダーのタブは日付をまたいでもほぼ同じ並びになる。
 */
export function groupCategories(day: TrendDay): TrendGroup[] {
	const groups = new Map<string, TrendGroup>();
	for (const cat of day.categories) {
		const slash = cat.name.indexOf('/');
		const name = slash === -1 ? cat.name : cat.name.slice(0, slash);
		const label = slash === -1 ? cat.name : cat.name.slice(slash + 1);
		let group = groups.get(name);
		if (!group) {
			group = { name, sections: [] };
			groups.set(name, group);
		}
		group.sections.push({ label, items: cat.items });
	}
	return [...groups.values()];
}

export function adjacentDates(date: string): { newer?: string; older?: string } {
	const i = trendDays.findIndex((d) => d.date === date);
	if (i === -1) return {};
	return { newer: trendDays[i - 1]?.date, older: trendDays[i + 1]?.date };
}
