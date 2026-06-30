import ThemeFormConfigTypes from '@fuse/core/FuseSettings/ThemeFormConfigTypes';
import layout1, { Layout1ConfigDefaultsType } from './layout1/Layout1Config';

export type themeLayoutDefaultsProps = Layout1ConfigDefaultsType;

export type themeLayoutProps = {
	title: string;
	defaults: themeLayoutDefaultsProps;
	form?: ThemeFormConfigTypes;
};

export type themeLayoutConfigsProps = Record<string, themeLayoutProps>;

const themeLayoutConfigs: themeLayoutConfigsProps = {
	layout1: layout1 as themeLayoutProps,
};

export default themeLayoutConfigs;
