import { error } from '@sveltejs/kit';
import { getTrendWeek, trendDays, trendWeeks } from '$lib/trends';
import type { EntryGenerator, PageLoad } from './$types';

// 週の初め（日曜日）の URL に加え、以前の日別 URL も同じ週のページとして残す
export const entries: EntryGenerator = () => {
	const dates = new Set([...trendWeeks.map((w) => w.start), ...trendDays.map((d) => d.date)]);
	return [...dates].map((date) => ({ date }));
};

export const load: PageLoad = ({ params }) => {
	const week = getTrendWeek(params.date);
	if (!week) error(404, 'Not found');
	return { week };
};
