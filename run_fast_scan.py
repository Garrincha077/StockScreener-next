#!/usr/bin/env python3
"""Run the existing full-market scanner with the batched-price processor.

The reporting/signal logic stays exactly in run_optimized_scan.py. Only the
processor class is swapped, which makes rollback trivial.
"""
from src.screening.fast_batch_processor import FastOptimizedBatchProcessor
import run_optimized_scan

run_optimized_scan.OptimizedBatchProcessor = FastOptimizedBatchProcessor

if __name__ == "__main__":
    run_optimized_scan.main()
