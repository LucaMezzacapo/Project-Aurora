import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface AltitudeChartProps {
  data: Array<{ time: string; altitude: number }>;
}

export function AltitudeChart({ data }: AltitudeChartProps) {
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg">Altitude vs Time</h3>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse"></div>
          <span className="text-xs text-slate-400">Continuously Updating</span>
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis 
            dataKey="time" 
            stroke="#64748b"
            style={{ fontSize: '12px' }}
          />
          <YAxis 
            stroke="#64748b"
            style={{ fontSize: '12px' }}
            label={{ value: 'Altitude (m)', angle: -90, position: 'insideLeft', fill: '#64748b' }}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#1e293b', 
              border: '1px solid #475569',
              borderRadius: '8px'
            }}
            labelStyle={{ color: '#e2e8f0' }}
          />
          <Line 
            type="monotone" 
            dataKey="altitude" 
            stroke="#06b6d4" 
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      
      <div className="text-xs text-slate-500 mt-2">Real-time altitude tracking</div>
    </div>
  );
}
