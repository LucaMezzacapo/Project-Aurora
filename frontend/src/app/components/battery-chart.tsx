import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface BatteryChartProps {
  data: Array<{ time: string; voltage: number; current: number }>;
}

export function BatteryChart({ data }: BatteryChartProps) {
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg">Battery Monitoring</h3>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-xs text-slate-400">Live Data</span>
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
            yAxisId="left"
            stroke="#64748b"
            style={{ fontSize: '12px' }}
            label={{ value: 'Voltage (V)', angle: -90, position: 'insideLeft', fill: '#64748b' }}
          />
          <YAxis 
            yAxisId="right"
            orientation="right"
            stroke="#64748b"
            style={{ fontSize: '12px' }}
            label={{ value: 'Current (A)', angle: 90, position: 'insideRight', fill: '#64748b' }}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#1e293b', 
              border: '1px solid #475569',
              borderRadius: '8px'
            }}
            labelStyle={{ color: '#e2e8f0' }}
          />
          <Legend 
            wrapperStyle={{ fontSize: '12px' }}
            iconType="line"
          />
          <Line 
            yAxisId="left"
            type="monotone" 
            dataKey="voltage" 
            stroke="#10b981" 
            strokeWidth={2}
            name="Voltage (V)"
            dot={false}
            isAnimationActive={false}
          />
          <Line 
            yAxisId="right"
            type="monotone" 
            dataKey="current" 
            stroke="#f59e0b" 
            strokeWidth={2}
            name="Current (A)"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      
      <div className="text-xs text-slate-500 mt-2">Voltage and current trends</div>
    </div>
  );
}
