package com.tips3x3.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class TradeFlowTest {

  @Test
  public void capsStakeToCurrentExecutableLiquidity() {
    assertEquals(12.34, BetBraTradeEngine.capStakeToExecutableLiquidity(50.0, 12.345), 0.0001);
    assertEquals(10.0, BetBraTradeEngine.capStakeToExecutableLiquidity(10.0, 25.0), 0.0001);
    assertEquals(0.0, BetBraTradeEngine.capStakeToExecutableLiquidity(10.0, 0.0), 0.0001);
  }

  @Test
  public void recalculatesBackFromTheActuallyPlacedLayOdds() {
    assertEquals(
        22.10,
        BetBraTradeEngine.targetBackForLiabilityProfit(20.0, 0.005),
        0.0001);
    assertEquals(
        35.09,
        BetBraTradeEngine.targetBackForLiabilityProfit(30.0, 0.005),
        0.0001);
  }

  @Test
  public void matchedBackPhaseStopsBlockingNewEntries() {
    assertTrue(AutoLayForegroundService.isOpenGreenTradePhase("lay_sent"));
    assertTrue(AutoLayForegroundService.isOpenGreenTradePhase("awaiting_lay_match"));
    assertTrue(AutoLayForegroundService.isOpenGreenTradePhase("awaiting_back"));
    assertTrue(AutoLayForegroundService.isOpenGreenTradePhase("back_sent"));
    assertFalse(AutoLayForegroundService.isOpenGreenTradePhase("closed"));
    assertFalse(AutoLayForegroundService.isOpenGreenTradePhase(""));
  }
}
