<script lang="ts">
	import TrendWeekView from '$lib/components/TrendWeekView.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{data.week.start}〜{data.week.end} トレンド | Daily Trends</title>
</svelte:head>

<TrendWeekView week={data.week} />
