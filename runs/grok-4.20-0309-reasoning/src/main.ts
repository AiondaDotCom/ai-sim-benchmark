import './style.css'
import { WaterSimulation } from './simulation'

const canvas = document.createElement('canvas')
canvas.style.width = '100%'
canvas.style.height = '100vh'
canvas.style.display = 'block'
document.body.appendChild(canvas)

const sim = new WaterSimulation(canvas)
sim.start()
