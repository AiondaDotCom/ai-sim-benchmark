import './style.css';
import { WaterDemo } from './app';
import { readConfig } from './config';

const demo = new WaterDemo(document.body, readConfig(window.location.search));
demo.start();
