<script lang="ts">
	import TrendDayView from '$lib/components/TrendDayView.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{data.day.date} トレンド | Daily Trends</title>
</svelte:head>

<TrendDayView day={data.day} />
