import { MaterialReactTable, useMaterialReactTable, type MaterialReactTableProps, type MRT_Icons } from 'material-react-table';
import _ from 'lodash';
import { useMemo } from 'react';
import FuseSvgIcon from '@components/adapters/Icon';
import type { Theme } from '@mui/material/styles';
import DataTableTopToolbar from './DataTableTopToolbar';
import { useThemeMediaQuery } from '@fuse/hooks';

const tableIcons: Partial<MRT_Icons> = {
	// @ts-expect-error — framework code, strict null check
	ArrowDownwardIcon: (props) => <FuseSvgIcon {...props}>lucide:arrow-down</FuseSvgIcon>,
	ClearAllIcon: () => <FuseSvgIcon>lucide:brush-cleaning</FuseSvgIcon>,
	DensityLargeIcon: () => <FuseSvgIcon>lucide:rows-2</FuseSvgIcon>,
	DensityMediumIcon: () => <FuseSvgIcon>lucide:rows-3</FuseSvgIcon>,
	DensitySmallIcon: () => <FuseSvgIcon>lucide:rows-4</FuseSvgIcon>,
	DragHandleIcon: () => <FuseSvgIcon>lucide:grip-vertical</FuseSvgIcon>,
	// @ts-expect-error — framework code, strict null check
	FilterListIcon: (props) => <FuseSvgIcon {...props}>lucide:list-filter</FuseSvgIcon>,
	FilterListOffIcon: () => <FuseSvgIcon>lucide:funnel</FuseSvgIcon>,
	FullscreenExitIcon: () => <FuseSvgIcon>lucide:log-in</FuseSvgIcon>,
	FullscreenIcon: () => <FuseSvgIcon>lucide:log-out</FuseSvgIcon>,
	// @ts-expect-error — framework code, strict null check
	SearchIcon: (props) => <FuseSvgIcon {...props}>lucide:search</FuseSvgIcon>,
	SearchOffIcon: () => <FuseSvgIcon>lucide:search-x</FuseSvgIcon>,
	ViewColumnIcon: () => <FuseSvgIcon>lucide:columns-3-cog</FuseSvgIcon>,
	MoreVertIcon: () => <FuseSvgIcon>lucide:ellipsis-vertical</FuseSvgIcon>,
	MoreHorizIcon: () => <FuseSvgIcon>lucide:ellipsis</FuseSvgIcon>,
	// @ts-expect-error — framework code, strict null check
	SortIcon: (props) => <FuseSvgIcon {...props}>lucide:arrow-down-up</FuseSvgIcon>,
	// @ts-expect-error — framework code, strict null check
	PushPinIcon: (props) => <FuseSvgIcon {...props}>lucide:pin</FuseSvgIcon>,
	VisibilityOffIcon: () => <FuseSvgIcon>lucide:eye-off</FuseSvgIcon>
};

// @ts-expect-error — framework code, strict null check
function DataTable<TData>(props: MaterialReactTableProps<TData>) {
	const { columns, data, ...rest } = props;
	const isMobile = useThemeMediaQuery((theme) => theme.breakpoints.down('lg'));
	const defaults = useMemo(
		() =>
			// @ts-expect-error — framework code, strict null check
			_.defaults(rest, {
				initialState: {
					density: 'compact',
					showColumnFilters: false,
					showGlobalFilter: true,
					columnPinning: {
						left: isMobile ? [] : ['mrt-row-expand', 'mrt-row-select'],
						right: isMobile ? [] : ['mrt-row-actions']
					},
					pagination: {
						pageSize: 15
					},
					enableFullScreenToggle: false
				},
				enableFullScreenToggle: false,
				enableColumnFilterModes: true,
				enableColumnOrdering: true,
				enableGrouping: true,
				enableColumnPinning: true,
				enableFacetedValues: true,
				enableRowActions: true,
				enableRowSelection: true,
				muiBottomToolbarProps: {
					className: 'flex items-center min-h-14 h-14'
				},
				muiTablePaperProps: {
					elevation: 0,
					square: true,
					className: 'flex flex-col flex-auto h-full'
				},
				muiTableContainerProps: {
					className: 'flex-auto'
				},
				enableStickyHeader: true,
				// enableStickyFooter: true,
				paginationDisplayMode: 'pages',
				positionToolbarAlertBanner: 'top',
				muiPaginationProps: {
					color: 'secondary',
					rowsPerPageOptions: [10, 20, 30],
					shape: 'rounded',
					variant: 'outlined',
					showRowsPerPage: false
				},
				muiSearchTextFieldProps: {
					placeholder: 'Search',
					sx: { minWidth: '300px' },
					variant: 'outlined',
					size: 'small'
				},
				muiFilterTextFieldProps: {
					variant: 'outlined',
					size: 'small',
					sx: {
						'& .MuiInputAdornment-root': {
							padding: 0,
							margin: 0
						},
						'& .MuiInputBase-root': {
							padding: 0
						},
						'& .MuiInputBase-input': {
							padding: 0
						}
					}
				},
				muiSelectAllCheckboxProps: {
					size: 'small'
				},
				muiSelectCheckboxProps: {
					size: 'small'
				},
				muiTableBodyRowProps: ({ row, table }) => {
					const { density } = table.getState();

					if (density === 'compact') {
						return {
							sx: {
								backgroundColor: 'initial',
								opacity: 1,
								boxShadow: 'none',
								height: row.getIsPinned() ? `${37}px` : undefined
							}
						};
					}

					return {
						sx: {
							backgroundColor: 'initial',
							opacity: 1,
							boxShadow: 'none',
							// Set a fixed height for pinned rows
							height: row.getIsPinned() ? `${density === 'comfortable' ? 53 : 69}px` : undefined
						}
					};
				},
				muiTableHeadCellProps: ({ column }) => ({
					sx: {
						'& .Mui-TableHeadCell-Content-Labels': {
							flex: 1,
							justifyContent: 'space-between'
						},
						'& .Mui-TableHeadCell-Content-Actions': {
							'& > button': {
								marginX: '2px'
							}
						},
						'& .MuiFormHelperText-root': {
							textAlign: 'center',
							marginX: 0,
							color: (theme: Theme) => theme.vars.palette.text.disabled,
							fontSize: 13
						},
						backgroundColor: (theme) =>
							column.getIsPinned() ? theme.vars.palette.background.paper : 'inherit'
					}
				}),
				mrtTheme: (theme) => ({
					baseBackgroundColor: theme.palette.background.paper,
					menuBackgroundColor: theme.palette.background.paper,
					pinnedRowBackgroundColor: theme.palette.background.paper,
					pinnedColumnBackgroundColor: theme.palette.background.paper
				}),
				// @ts-expect-error — framework code, strict null check
				renderTopToolbar: (_props) => <DataTableTopToolbar {..._props} />,
				icons: tableIcons,
				positionActionsColumn: 'last'
			// @ts-expect-error — framework code, strict null check
			} as Partial<MaterialReactTableProps<TData>>),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[rest]
	);

	const tableOptions = useMemo(
		() => ({
			columns,
			data,
			...defaults,
			...rest
		}),
		[columns, data, defaults, rest]
	);

	// @ts-expect-error — framework code, strict null check
	const tableInstance = useMaterialReactTable<TData>(tableOptions);

	// @ts-expect-error — framework code, strict null check
	return <MaterialReactTable table={tableInstance} />;
}

export default DataTable;
