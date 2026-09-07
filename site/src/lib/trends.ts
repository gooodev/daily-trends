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
