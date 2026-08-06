"use client";

import { motion } from "framer-motion";
import { BrainCircuit, Heart, Layers3, ShieldAlert, Users } from "lucide-react";

const ITEMS = [
  { icon: Layers3, label: "Filtros Exclusivos por Mercado" },
  { icon: BrainCircuit, label: "IA e Big Data em Tempo Real" },
  { icon: ShieldAlert, label: "Segurança e Gestão de Risco" },
  { icon: Heart, label: "Mais Lucro e Menos Emoção" },
  { icon: Users, label: "Suporte Especializado" },
];

export default function FeatureSection() {
  return (
    <section className="fs-root">
      {ITEMS.map((item, i) => (
        <motion.div
          className="fs-item"
          key={item.label}
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.45, delay: i * 0.06 }}
        >
          <span className="fs-icon">
            <item.icon size={20} aria-hidden />
          </span>
          <span className="fs-label">{item.label}</span>
        </motion.div>
      ))}
    </section>
  );
}
